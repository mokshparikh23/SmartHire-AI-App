/**
 * RESUME-UPLOAD 2026-08-30
 *
 * Every write to the `resumes` bucket, in one place, on the service role.
 *
 * WHY NOTHING HERE RUNS IN A BROWSER. The bucket has no permissive
 * INSERT/UPDATE/DELETE policy for any browser role — see
 * 20260830020000_resume_files.sql — so a client cannot write to it even holding
 * a valid session. That is not belt-and-braces, it is the only way to check the
 * one thing that matters: an RLS policy sees an object's bucket and name but
 * never its BYTES, and allowed_mime_types is matched against the Content-Type
 * the client declared. A 4 MB ZIP labelled application/pdf satisfies every
 * database-side control there is. sniffPdf() in lib/resume.js is the check that
 * catches it, and only whoever holds the bytes can run it.
 *
 * Server-only: importing this from a client component would pull the
 * service-role key into the bundle.
 */
import { createAdminClient } from 'smarthire-data/supabase-server'
import { RESUME_BUCKET } from '@/lib/resume'

/**
 * The object path for a resume.
 *
 * The FIRST SEGMENT IS THE OWNER, and the storage SELECT policy is a plain
 * string compare against it — `(storage.foldername(name))[1] = auth.uid()::text`
 * — with no join back to interview_profiles. A policy that joins is a policy
 * that can be wrong; this one cannot be. The second segment scopes a profile so
 * its files can be listed or removed by prefix.
 *
 * The filename is a fresh UUID rather than the candidate's own, for two reasons.
 * "Priya_Sharma_Resume_2026.pdf" is itself PII and would otherwise appear in
 * every access log and every signed URL we mint; and a new UUID per upload means
 * REPLACING a resume is genuinely a new object, so an outstanding signed URL for
 * the old one can never quietly start serving different bytes. The display name
 * is kept in resume_file_name, as data rather than as an identifier.
 */
export function resumePath(userId, profileId) {
  return `${userId}/${profileId}/${crypto.randomUUID()}.pdf`
}

/**
 * Store a validated PDF. Returns the path.
 *
 * upsert:false because the path is always new — combined with the migration's
 * omitted UPDATE policy, a stored resume's bytes can never be swapped while its
 * row, its filename and its consent flag stay the same.
 *
 * cacheControl '0' so a shared or borrowed browser does not keep a stranger's
 * resume on disk after the tab closes.
 */
export async function putResume({ userId, profileId, bytes }) {
  /* Storage accepts an empty body happily, and an empty object is the one
     failure this whole file cannot detect later: the upload returns no error,
     the row is written, and the break only appears when a browser is asked to
     render zero bytes as a PDF. It has happened once — the parse route handed
     its array to pdf.js first, which transferred the ArrayBuffer away and left
     a detached, length-0 view behind. The caller is fixed; this is the guard
     that makes the next such refactor fail at the write instead of in a viewer
     days later. */
  if (!bytes?.byteLength) throw new Error('Refusing to store an empty resume file')

  const path = resumePath(userId, profileId)
  const { error } = await createAdminClient()
    .storage.from(RESUME_BUCKET)
    .upload(path, bytes, {
      contentType: 'application/pdf',
      upsert: false,
      cacheControl: '0',
    })

  if (error) throw new Error(error.message)
  return path
}

/**
 * Best-effort removal. Never throws.
 *
 * Used as the compensating action when a row write fails after the bytes
 * landed. It must not be able to turn a recoverable "could not save, try again"
 * into a 500 of its own — and if it does fail, tombstone() below is the backstop
 * that gets the file collected later.
 */
export async function removeResume(path) {
  if (!path) return true
  try {
    const { error } = await createAdminClient()
      .storage.from(RESUME_BUCKET).remove([path])
    return !error
  } catch {
    return false
  }
}

/** Queue a path for collection when we could not remove it inline. */
export async function tombstone({ path, userId, reason }) {
  if (!path) return
  try {
    await createAdminClient().from('storage_orphans').insert({
      bucket_id: RESUME_BUCKET, object_path: path, user_id: userId, reason,
    })
  } catch { /* the drain is opportunistic anyway; a lost tombstone is a leaked file, not a fault */ }
}

/**
 * Pay down the deletion debt recorded by the tombstone trigger.
 *
 * WHY THIS EXISTS AT ALL: a Postgres trigger cannot delete a stored file. It can
 * delete the storage.objects metadata row — and the blob then stays in the
 * bucket, unreachable and attributable to nobody. So the trigger records what
 * needs deleting and this is the only thing that can act on it.
 *
 * Called fire-and-forget from the tail of the parse and delete routes rather
 * than on a cron. In practice the queue never holds more than a handful of rows
 * because every resume action drains it, which makes the system self-healing
 * with no scheduled job to forget about. Never awaited by a request that a user
 * is waiting on.
 */
export async function drainOrphans(limit = 25) {
  try {
    const admin = createAdminClient()

    const { data: rows, error } = await admin
      .from('storage_orphans')
      .select('id, bucket_id, object_path')
      .is('swept_at', null)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error || !rows?.length) return 0

    // One batch per bucket. remove() is idempotent, so a path already gone —
    // the common case when the route removed it inline and tombstoned anyway —
    // is not an error.
    const byBucket = new Map()
    for (const r of rows) {
      if (!byBucket.has(r.bucket_id)) byBucket.set(r.bucket_id, [])
      byBucket.get(r.bucket_id).push(r.object_path)
    }

    const swept = []
    for (const [bucket, paths] of byBucket) {
      const { error: rmError } = await admin.storage.from(bucket).remove(paths)
      // Leave the rows unswept on failure so the next drain retries them.
      if (!rmError) swept.push(...rows.filter((r) => r.bucket_id === bucket).map((r) => r.id))
    }

    if (swept.length) {
      await admin.from('storage_orphans')
        .update({ swept_at: new Date().toISOString() })
        .in('id', swept)
    }
    return swept.length
  } catch {
    return 0
  }
}

/**
 * A short-lived URL for the Original PDF tab.
 *
 * Exported for server-side use, but the browser normally mints its own with the
 * anon client under the storage SELECT policy — that is what the one permissive
 * policy is for, and it saves a route. Sixty seconds because a signed URL is a
 * bearer token: anyone holding it can read the file, so it should outlive the
 * click that produced it and nothing more.
 */
export async function signResume(path, expiresIn = 60) {
  const { data, error } = await createAdminClient()
    .storage.from(RESUME_BUCKET).createSignedUrl(path, expiresIn)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

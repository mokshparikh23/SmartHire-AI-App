-- ═════════════════════════════════════════════════ session billing clamp ════
--
-- Nobody is billed for silence.
--
-- THE HOLE
--
-- session_settle() charges greatest(1, ceil((p_bill_until - started_at)/60)),
-- and its callers disagree about what p_bill_until should be:
--
--   sweep_stale_sessions()  last_heartbeat_at  — the time the client REPORTED
--   session_heartbeat()     now()
--   session_stop()          now()
--
-- The sweep's header promises "a laptop that slept for four hours is charged
-- for the time it actually reported". That promise was kept only by luck,
-- because the sweep has no cron — it rides along on license_snapshot() and
-- session_start(), and a sleeping or closed machine calls neither. On wake,
-- Chromium fires the overdue setInterval and the desktop's 10-second licence
-- poll at the same moment, and whichever won decided whether the user paid
-- three minutes or three hours.
--
-- The quit path had it worse and without the race: electron/main.cjs closes a
-- session on will-quit, so a window closed at 09:00 and quit at 12:00 posted a
-- stop that billed three hours. credit_debit() drains to zero rather than
-- refusing the whole charge, so the loss was capped at the user's entire
-- balance — and it landed labelled "Ended by you".
--
-- THE RULE
--
-- Past the stale window, this call IS a sweep, whoever made it. Clamp the time
-- to what the client last reported and close the row.
--
-- Closing is what makes the clamp safe. Clamping WITHOUT closing would be an
-- exploit: a client beating every 200 seconds would advance the meter by 90
-- seconds per 200 and run indefinitely at under half price. Because the row
-- closes, the only way to continue is a new session — which costs a fresh
-- minute. And the forgiven window is time no AI could have been used in:
-- lib/ai.js heartbeats on every /api/ai/* call, so any request inside it would
-- have moved last_heartbeat_at forward itself.
--
-- A caller that passed its own reason keeps it — a genuine client_stop arriving
-- late is still "Ended by you", it just does not bill the gap. Only the
-- reasonless heartbeat path falls through to 'stale'.
--
-- WHY 90 IS A LITERAL
--
-- It mirrors STALE_SECONDS in apps/dashboard/lib/metering.js. Adding a
-- p_stale_seconds parameter instead would create a SECOND signature, and the
-- revoke/grant block in 20260829120000_credit_billing.sql revokes the old one
-- by exact signature — a revoke against a stale signature silently does
-- nothing and leaves the function callable by any signed-in browser holding
-- the anon key. That is exactly how role escalation re-opened between bd5df64
-- and c548a01. The signature does not change here.

create or replace function public.session_settle(
  p_session_id uuid,
  p_bill_until timestamptz,
  p_close      boolean,
  p_reason     text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s        record;
  v_due    integer;
  v_need   integer;
  v_got    integer := 0;
  v_stop   boolean := false;
  v_reason text    := p_reason;
  v_bal    integer;
begin
  -- Lock order is ALWAYS interview_sessions then credit_wallets, in every
  -- function here, so deadlock is impossible.
  select * into s from public.interview_sessions where id = p_session_id for update;
  if not found then
    return json_build_object('ok', false, 'code', 'no_session', 'reason', 'Session not found');
  end if;

  select coalesce(minutes_balance, 0) into v_bal
    from public.credit_wallets where user_id = s.user_id;

  if s.ended_at is not null then
    return json_build_object(
      'ok', true, 'sessionId', s.id, 'userId', s.user_id,
      'stop', true, 'reason', s.end_reason, 'metered', s.metered,
      'minutesRemaining', coalesce(v_bal, 0),
      'minutesElapsed',   s.minutes_elapsed,
      'minutesCharged',   s.minutes_charged,
      'elapsedSeconds',   floor(extract(epoch from (s.ended_at - s.started_at)))::int);
  end if;

  -- BILL-UNTIL CLAMP 2026-08-30: see the header. Placed after the early return
  -- above, so ended_at is null is already implied.
  --
  -- Against every caller: session_start's first settle passes now() on a row
  -- whose last_heartbeat_at defaults to now(), so it never fires. A 20-second
  -- heartbeat never fires it. A post-sleep heartbeat closes as 'stale' billed to
  -- the last beat. A late session_stop keeps 'client_stop' and bills honestly.
  -- The supersede branch runs immediately after the sweep, so anything still
  -- open beat inside the window. And sweep_stale_sessions passes exactly these
  -- three values already, which makes this an idempotent no-op for it.
  if s.last_heartbeat_at < now() - interval '90 seconds' then
    p_bill_until := s.last_heartbeat_at;
    p_close      := true;
    v_reason     := coalesce(v_reason, 'stale');
  end if;

  v_due  := greatest(1, ceil(extract(epoch from (p_bill_until - s.started_at)) / 60.0))::integer;
  v_need := v_due - s.minutes_elapsed;

  if v_need > 0 then
    if s.metered then
      v_got := public.credit_debit(s.user_id, s.id, v_need, 'session_debit');
      if v_got < v_need then
        v_stop   := true;
        v_reason := 'out_of_credits';
      end if;
    else
      -- Unlimited: the meter advances, the wallet does not move.
      v_got := v_need;
    end if;
  end if;

  update public.interview_sessions
     set minutes_elapsed   = minutes_elapsed + v_got,
         minutes_charged   = minutes_charged + case when s.metered then v_got else 0 end,
         -- greatest() so the sweep (which passes last_heartbeat_at) cannot
         -- rewind the clock, while a heartbeat always advances it.
         last_heartbeat_at = greatest(last_heartbeat_at, p_bill_until),
         ended_at   = case when p_close or v_stop then now() else null end,
         end_reason = case when p_close or v_stop then coalesce(v_reason, 'client_stop') else null end
   where id = s.id;

  select coalesce(minutes_balance, 0) into v_bal
    from public.credit_wallets where user_id = s.user_id;

  return json_build_object(
    'ok', true,
    'sessionId', s.id,
    'userId',    s.user_id,
    'metered',   s.metered,
    'stop',      (p_close or v_stop),
    'reason',    case when (p_close or v_stop) then coalesce(v_reason, 'client_stop') else null end,
    'minutesRemaining', coalesce(v_bal, 0),
    'minutesElapsed',   s.minutes_elapsed + v_got,
    'minutesCharged',   s.minutes_charged + case when s.metered then v_got else 0 end,
    'elapsedSeconds',   floor(extract(epoch from (p_bill_until - s.started_at)))::int);
end $$;

-- ============================================================ function grants
-- CREATE OR REPLACE preserves the existing ACL, so the revoke in
-- 20260829120000_credit_billing.sql still stands. Re-issued anyway: the cost is
-- nothing and the failure mode of assuming otherwise is a world-callable
-- billing function. The signature below must stay byte-identical to the one in
-- that file's revoke array.
revoke all on function public.session_settle(uuid,timestamptz,boolean,text)
  from public, anon, authenticated;
grant execute on function public.session_settle(uuid,timestamptz,boolean,text)
  to service_role;

notify pgrst, 'reload schema';

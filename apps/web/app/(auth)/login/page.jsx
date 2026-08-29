import AuthForm from '@/components/auth/AuthForm'

export const metadata = { title: 'Login — Interview Assistant' }

export default function LoginPage() {
  return <AuthForm mode="login" />
}
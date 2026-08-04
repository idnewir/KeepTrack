import { Link } from 'react-router-dom'
import AuthCard from '../components/AuthCard.jsx'

export default function PendingApprovalPage() {
  return (
    <AuthCard title="Awaiting approval">
      <p className="kt-auth-note">
        Your account has been created and is waiting for an Admin to approve
        it. You'll be able to log in as soon as that happens.
      </p>
      <p className="kt-auth-footer">
        <Link to="/login">Back to login</Link>
      </p>
    </AuthCard>
  )
}

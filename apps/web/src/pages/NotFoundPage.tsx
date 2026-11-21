import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { homePathFor, useAuth } from '../auth';
import { EmptyState } from '../components/Feedback';
import { Button } from '../components/ui/button';

export default function NotFoundPage() {
  const { user } = useAuth();
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="This page doesn’t exist, or it isn’t part of your role."
      action={
        <Button asChild variant="secondary">
          <Link to={user ? homePathFor(user) : '/login'}>Go to my home page</Link>
        </Button>
      }
    />
  );
}

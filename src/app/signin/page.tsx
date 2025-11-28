'use client';

import { useState, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { Input } from '@heroui/input';
import { Button } from '@heroui/button';
import { Card, CardBody } from '@heroui/card';
import { Chip } from '@heroui/chip';

import { title } from '@/components/Primitives';
import { hasUser } from '@/lib/auth/user-store';

export default function SigninPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingUser, setIsCheckingUser] = useState(true);
  const [error, setError] = useState('');
  const [userExists, setUserExists] = useState<boolean | null>(null);
  const [authSuccess, setAuthSuccess] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
  });
  const { data: session, status } = useSession();

  // Check if user exists on component mount
  useEffect(() => {
    async function checkUser() {
      try {
        const exists = await hasUser();
        setUserExists(exists);
      } catch (err) {
        console.error('Error checking user:', err);
        setError('Failed to check user status');
      } finally {
        setIsCheckingUser(false);
      }
    }
    checkUser();
  }, []);

  // Redirect to dashboard if already authenticated or auth was successful
  useEffect(() => {
    if ((status === 'authenticated' && session) || authSuccess) {
      console.log('[SIGNIN] User authenticated, redirecting to dashboard');
    }
  }, [status, session, authSuccess]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError(''); // Clear error when user starts typing
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Basic validation
    if (!formData.username || !formData.password) {
      setError('Username and password are required');
      setIsLoading(false);
      return;
    }

    const isSignup = !userExists;
    if (isSignup && formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      setIsLoading(false);
      return;
    }

    console.log('[SIGNIN] Attempting authentication...');
    try {
      await signIn('credentials', {
        username: formData.username,
        password: formData.password,
        callbackUrl: '/dashboard',
      });

      setAuthSuccess(true);
    } catch (err) {
      console.error('[SIGNIN] Authentication error:', err);
      setError('An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  // Show loading state while checking user status, if session is loading, or after successful auth
  if (isCheckingUser || status === 'loading' || authSuccess) {
    return (
      <div className="w-full max-w-md mx-auto text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-default-600">
            {isCheckingUser
              ? 'Checking system status...'
              : authSuccess
                ? 'Authentication successful! Redirecting...'
                : 'Loading session...'}
          </p>
        </div>
      </div>
    );
  }

  // Don't show the form if already authenticated
  if (status === 'authenticated') {
    return (
      <div className="w-full max-w-md mx-auto text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-default-600">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  const isSignup = !userExists;

  return (
    <div className="w-full max-w-md mx-auto">
      <h1 className={`${title()} text-center mb-16 text-2xl`}>
        {isSignup ? 'Create Account' : 'Sign In'}
      </h1>

      <Card className="w-full mt-10">
        <CardBody className="p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              name="username"
              type="text"
              label="Username"
              placeholder="Enter your username"
              value={formData.username}
              onChange={handleInputChange}
              isRequired
              variant="bordered"
            />

            <Input
              name="password"
              type="password"
              label="Password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleInputChange}
              isRequired
              variant="bordered"
            />

            {isSignup && (
              <Input
                name="confirmPassword"
                type="password"
                label="Confirm Password"
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                isRequired
                variant="bordered"
              />
            )}

            {error && (
              <Chip color="danger" variant="flat" className="w-full p-3 h-auto whitespace-normal">
                {error}
              </Chip>
            )}

            <Button
              type="submit"
              color="primary"
              size="lg"
              isLoading={isLoading}
              className="w-full mt-2"
            >
              {isSignup ? 'Create Account' : 'Sign In'}
            </Button>
          </form>
        </CardBody>
      </Card>

      {isSignup && (
        <Card className="mt-6" shadow="sm">
          <CardBody className="p-4">
            <div className="flex items-start gap-3">
              <Chip color="warning" variant="flat" size="sm">
                Warning
              </Chip>
              <p className="text-md text-default-600">
                No account exists yet. Create the first and <strong>only</strong> account for this
                system.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {!isSignup && (
        <Card className="mt-6" shadow="sm">
          <CardBody className="p-4">
            <div className="flex items-start gap-3">
              <p className="text-sm text-default-600">
                An account already exists. Please sign in with your credentials.
              </p>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

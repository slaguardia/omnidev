// lib/auth.ts
import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getUser, verifyUser, saveUser } from '@/lib/auth/user-store';

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const { username, password } = credentials ?? {};
        const existingUser = await getUser();

        if (!existingUser) {
          const newUser = await saveUser(username!, password!);
          return { id: newUser.username, name: newUser.username };
        }

        const valid = await verifyUser(username!, password!);
        return valid ? { id: existingUser.username, name: existingUser.username } : null;
      },
    }),
  ],
  pages: {
    signIn: '/signin',
  },
};

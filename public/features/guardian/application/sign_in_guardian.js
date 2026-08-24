function requireAuthUser(authUser) {
  if (!authUser?.uid || !authUser?.email) {
    throw new Error("Firebase did not return a valid authenticated user.");
  }

  return authUser;
}

function guardianProfileNotFoundError() {
  const error = new Error("No guardian account was found for these credentials.");
  error.code = "guardian/profile-not-found";
  return error;
}

export class SignInGuardian {
  constructor({ guardianRepository, guardianAuthService }) {
    this.guardianRepository = guardianRepository;
    this.guardianAuthService = guardianAuthService;
  }

  async withEmail({ email, password }) {
    const authUser = requireAuthUser(
      await this.guardianAuthService.signInWithEmail({ email, password })
    );

    try {
      const guardian = await this.guardianRepository.getById(authUser.uid);

      if (!guardian) {
        throw guardianProfileNotFoundError();
      }

      return { guardian, authUser };
    } catch (error) {
      await this.signOutAfterFailure();
      throw error;
    }
  }

  async withGoogle() {
    const authResult = await this.guardianAuthService.signInWithGoogle();
    const authUser = requireAuthUser(authResult?.user);

    try {
      const guardian = await this.guardianRepository.getById(authUser.uid);

      if (!guardian) {
        throw guardianProfileNotFoundError();
      }

      return { guardian, authUser };
    } catch (error) {
      try {
        if (authResult?.additionalUserInfo?.isNewUser === true) {
          await this.guardianAuthService.deleteGoogleAccount();
        } else {
          await this.guardianAuthService.signOut();
        }
      } catch (cleanupError) {
        console.error("Could not clean up failed guardian Google sign in.", cleanupError);
      }

      throw error;
    }
  }

  async signOutAfterFailure() {
    try {
      await this.guardianAuthService.signOut();
    } catch (cleanupError) {
      console.error("Could not sign out after failed guardian sign in.", cleanupError);
    }
  }
}

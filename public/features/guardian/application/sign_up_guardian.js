import { guardianAuthTypes } from "../../../config/firebase/guardian_schema.js";

const EMAIL_AUTH_METHOD = "password";
const GOOGLE_AUTH_METHOD = "google.com";

function requireAuthUser(authUser) {
  if (!authUser?.uid || !authUser?.email) {
    throw new Error("Firebase did not return a valid authenticated user.");
  }

  return authUser;
}

function getGoogleGuardianName(authUser) {
  const displayName = String(authUser.displayName ?? "").trim();

  if (displayName) {
    return displayName;
  }

  return String(authUser.email).split("@")[0];
}

export class SignUpGuardian {
  constructor({ guardianRepository, createGuardian, guardianAuthService }) {
    this.guardianRepository = guardianRepository;
    this.createGuardian = createGuardian;
    this.guardianAuthService = guardianAuthService;
  }

  async withEmail({ name, email, password }) {
    const authUser = requireAuthUser(
      await this.guardianAuthService.signUpWithEmail({
        email,
        password,
        displayName: name
      })
    );

    try {
      const guardian = await this.createGuardian.execute({
        id: authUser.uid,
        authUid: authUser.uid,
        name,
        email: authUser.email,
        registrationDate: new Date(),
        authMethod: EMAIL_AUTH_METHOD,
        authType: guardianAuthTypes.EMAIL
      });

      return { guardian, authUser };
    } catch (error) {
      try {
        await this.guardianAuthService.deleteEmailAccount();
      } catch (rollbackError) {
        console.error("Could not roll back guardian email account.", rollbackError);
      }

      throw error;
    }
  }

  async withGoogle() {
    const authResult = await this.guardianAuthService.signUpWithGoogle();
    const authUser = requireAuthUser(authResult?.user);
    const existingGuardian = await this.guardianRepository.getById(authUser.uid);

    if (existingGuardian) {
      return {
        guardian: existingGuardian,
        authUser,
        isNewGuardian: false
      };
    }

    try {
      const guardian = await this.createGuardian.execute({
        id: authUser.uid,
        authUid: authUser.uid,
        name: getGoogleGuardianName(authUser),
        email: authUser.email,
        registrationDate: new Date(),
        authMethod: GOOGLE_AUTH_METHOD,
        authType: guardianAuthTypes.GOOGLE
      });

      return {
        guardian,
        authUser,
        isNewGuardian: true
      };
    } catch (error) {
      try {
        if (authResult?.additionalUserInfo?.isNewUser === true) {
          await this.guardianAuthService.deleteGoogleAccount();
        } else {
          await this.guardianAuthService.signOut();
        }
      } catch (rollbackError) {
        console.error("Could not roll back guardian Google signup.", rollbackError);
      }

      throw error;
    }
  }
}

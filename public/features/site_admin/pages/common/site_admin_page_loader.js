import {
  requireCurrentSiteAdmin
} from "../../site_admin_module.js?v=20260827-site-admin-guard-v1";
import {
  onFirebaseAuthStateChanged
} from "../../../../utils/firebase/firebase_auth.js";

function waitForFirebaseAuth() {
  return new Promise((resolve, reject) => {
    let unsubscribe = null;

    try {
      unsubscribe = onFirebaseAuthStateChanged((user) => {
        unsubscribe?.();
        resolve(user);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function renderAccessDenied(message) {
  const main = document.createElement("main");
  const panel = document.createElement("section");
  const heading = document.createElement("h1");
  const detail = document.createElement("p");
  const homeLink = document.createElement("a");

  document.title = "Access Denied";
  document.body.replaceChildren(main);

  main.style.boxSizing = "border-box";
  main.style.margin = "0 auto";
  main.style.maxWidth = "680px";
  main.style.padding = "48px 20px";

  panel.style.background = "#ffffff";
  panel.style.border = "1px solid #fca5a5";
  panel.style.borderRadius = "8px";
  panel.style.padding = "24px";

  heading.textContent = "Access denied";
  heading.style.margin = "0 0 10px";

  detail.textContent = message;
  detail.style.color = "#991b1b";
  detail.style.margin = "0 0 18px";

  homeLink.href = "/index.html";
  homeLink.textContent = "Back to Home";
  homeLink.style.color = "#0369a1";
  homeLink.style.fontWeight = "700";

  panel.append(heading, detail, homeLink);
  main.append(panel);
  document.documentElement.hidden = false;
}

async function loadProtectedPage() {
  const loader = document.querySelector("script[data-site-admin-page]");
  const pageModule = loader?.dataset.pageModule || "";

  try {
    await waitForFirebaseAuth();
    await requireCurrentSiteAdmin();
    document.documentElement.hidden = false;

    if (pageModule) {
      await import(new URL(pageModule, document.baseURI).href);
    }
  } catch (error) {
    console.error(error);
    renderAccessDenied(
      error.message || "A site-administrator account is required."
    );
  }
}

await loadProtectedPage();

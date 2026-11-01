export function watchStudentBillingGate({observeAuth, observeAccess, redirect, callback}) {
  let generation = 0, stopAccess = () => {};
  const stopAuth = observeAuth(user => {
    const current = ++generation; stopAccess(); stopAccess = () => {};
    if (!user) {callback(null); return;}
    try {stopAccess = observeAccess(user.uid, access => {
      if (current !== generation) return;
      if (access.allowed) callback(user);
      else redirect("subscription-suspended");
    }, () => {if (current === generation) redirect("access-unavailable");});}
    catch {if (current === generation) redirect("access-unavailable");}
  });
  return () => {generation++; stopAccess(); stopAuth();};
}

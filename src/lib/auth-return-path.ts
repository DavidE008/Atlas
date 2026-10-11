export type AuthReturnTarget = "admin-reviewers" | undefined;

export function getAuthReturnPath(target: AuthReturnTarget) {
  return target === "admin-reviewers" ? "/admin/reviewers" : "/missions";
}

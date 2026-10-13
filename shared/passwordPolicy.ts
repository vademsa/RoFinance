export const PASSWORD_REQUIREMENTS_VI = 'Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường và số.';
export const PASSWORD_MAX_BYTES_VI = 'Mật khẩu tối đa 72 byte UTF-8 để được băm đầy đủ.';
/** Shared by registration UI and both backend registration entry points. */
export function passwordPolicyError(password: unknown): string | null {
  if (typeof password !== 'string' || Array.from(password).length < 8 || !/\p{Lu}/u.test(password) || !/\p{Ll}/u.test(password) || !/[0-9]/.test(password)) return PASSWORD_REQUIREMENTS_VI;
  if (password.length > 128 || new TextEncoder().encode(password).length > 72) return PASSWORD_MAX_BYTES_VI;
  if (/[\u0000-\u001f\u007f]/.test(password)) return 'Mật khẩu không được chứa ký tự điều khiển.';
  return null;
}

import React, { useEffect, useRef, useState } from 'react';
import {
  Apple,
  X,
  Lock,
  Mail,
  KeyRound,
  LogOut,
  CheckCircle2,
  Camera,
  Save,
  Trash2,
} from 'lucide-react';
import { authApi, supportsOAuth, type AuthUser } from '@platform';

const MAX_SOURCE_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_SAVED_AVATAR_BYTES = 1024 * 1024;
const AVATAR_SIZE = 384;

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0]?.toLocaleUpperCase('vi-VN'))
    .join('') || 'RF';

const estimateDataUrlBytes = (dataUrl: string) => {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.floor((base64.length * 3) / 4);
};

async function prepareAvatar(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Chỉ hỗ trợ ảnh PNG, JPEG hoặc WebP.');
  }
  if (file.size > MAX_SOURCE_AVATAR_BYTES) {
    throw new Error('Ảnh gốc phải nhỏ hơn 5 MB.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Không thể đọc nội dung ảnh.'));
      element.src = objectUrl;
    });
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    if (!sourceSize) throw new Error('Kích thước ảnh không hợp lệ.');

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Trình duyệt không thể xử lý ảnh này.');
    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    );
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error('Trình duyệt không thể nén ảnh này.')),
        'image/jpeg',
        0.88,
      );
    });
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Không thể đọc ảnh sau khi xử lý.'));
      reader.onerror = () => reject(new Error('Không thể đọc ảnh sau khi xử lý.'));
      reader.readAsDataURL(blob);
    });
    if (estimateDataUrlBytes(dataUrl) > MAX_SAVED_AVATAR_BYTES) {
      throw new Error('Ảnh sau khi xử lý vẫn lớn hơn 1 MB.');
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: AuthUser | null;
  onAuthChanged: (user: AuthUser | null, expectedUserId?: string | null) => void;
  onLogoutWarning?: (warning: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  user,
  onAuthChanged,
  onLogoutWarning,
}) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const signOutInFlight = useRef(false);
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);
  const [providers, setProviders] = useState({ google: false, apple: false });
  const [displayName, setDisplayName] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (isOpen && !user && supportsOAuth) {
      authApi.providers().then(setProviders).catch(() => undefined);
    }
    if (isOpen && user) {
      setDisplayName(user.displayName);
      setAvatarPreview(user.avatarUrl);
      setAvatarDataUrl(undefined);
      setErrorMsg('');
      setSuccessMsg('');
    }
  }, [isOpen, user?.id, user?.displayName, user?.avatarUrl]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      if (isSignUp) {
        const { user } = await authApi.register(email, password);
        onAuthChanged(user, null);
        setSuccessMsg('Đăng ký tài khoản thành công! Dữ liệu của bạn được mã hóa & lưu bảo mật.');
      } else {
        const { user } = await authApi.login(email, password);
        onAuthChanged(user, null);
        setSuccessMsg('Đăng nhập thành công! Đã kết nối dữ liệu của bạn.');
      }
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Thao tác không thành công. Vui lòng kiểm tra lại email & mật khẩu.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (signOutInFlight.current || isLoading) return;
    signOutInFlight.current = true;
    setIsLoading(true);
    const ownerId = user?.id || null;
    try {
      const result = await authApi.logout();
      if ('tokenRemovalFailed' in result && result.tokenRemovalFailed) {
        onLogoutWarning?.('Đã khóa giao diện, nhưng không thể xóa thông tin phiên lưu trên thiết bị. Hãy thử đăng xuất lại khi ứng dụng hoạt động bình thường.');
      } else if ('revocationPending' in result && result.revocationPending) {
        onLogoutWarning?.('Đã đăng xuất trên thiết bị, nhưng chưa xác nhận được việc thu hồi phiên trên server do lỗi kết nối.');
      }
      onAuthChanged(null, ownerId);
      setSuccessMsg('Đã đăng xuất khỏi tài khoản.');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMsg('Lỗi đăng xuất: ' + err.message);
    } finally {
      signOutInFlight.current = false;
      setIsLoading(false);
    }
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setErrorMsg('');
    setSuccessMsg('');
    setIsProcessingAvatar(true);
    try {
      const prepared = await prepareAvatar(file);
      setAvatarPreview(prepared);
      setAvatarDataUrl(prepared);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Không thể xử lý ảnh đại diện.');
    } finally {
      setIsProcessingAvatar(false);
    }
  };

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const ownerId = user?.id;
    if (!ownerId) return;
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);
    try {
      await authApi.updateProfile(displayName, avatarDataUrl);
      const { user: persistedUser } = await authApi.me();
      if (!persistedUser) throw new Error('Phiên đăng nhập đã hết hạn.');
      if (persistedUser.id !== ownerId) return;
      onAuthChanged(persistedUser, ownerId);
      setDisplayName(persistedUser.displayName);
      setAvatarPreview(persistedUser.avatarUrl);
      setAvatarDataUrl(undefined);
      setSuccessMsg('Đã cập nhật hồ sơ cá nhân.');
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Không thể cập nhật hồ sơ cá nhân.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-[#18181b] rounded-[32px] shadow-2xl max-w-md w-full overflow-hidden border border-zinc-800 text-zinc-100 my-8">
        {/* Header */}
        <div className="bg-[#121214] text-white p-6 relative border-b border-zinc-800">
          <button
            type="button"
            aria-label="Đóng hồ sơ"
            onClick={onClose}
            className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1.5 rounded-xl hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 text-indigo-400">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-tight">
                {user ? 'Hồ sơ cá nhân' : 'Đăng nhập RoFinance'}
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {user ? user.email : 'Truy cập dữ liệu tài chính của bạn'}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {user ? (
            <div className="space-y-5">
              <form onSubmit={handleProfileSave} className="space-y-4">
                <div className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-[#121214] p-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-700 bg-indigo-500/10 text-xl font-black text-indigo-300">
                    {avatarPreview ? (
                      <img
                        key={avatarPreview}
                        src={avatarPreview}
                        alt={`Ảnh đại diện của ${displayName || user.displayName}`}
                        className="h-full w-full object-cover"
                        onError={() => setAvatarPreview(null)}
                      />
                    ) : (
                      <span aria-hidden="true" data-no-translate="true">{getInitials(displayName || user.displayName)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p data-no-translate="true" className="truncate text-sm font-black text-white">{displayName || user.displayName}</p>
                    <p className="truncate text-[11px] text-zinc-500">PNG, JPEG hoặc WebP · tối đa 5 MB</p>
                    <div className="flex flex-wrap gap-2">
                      <label className="cursor-pointer rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-3 py-2 text-[11px] font-bold text-indigo-300 transition-colors hover:bg-indigo-500/20 focus-within:ring-2 focus-within:ring-indigo-500/60">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={handleAvatarChange}
                          disabled={isProcessingAvatar || isLoading}
                        />
                        <span className="flex items-center gap-1.5">
                          <Camera className="h-3.5 w-3.5" />
                          {isProcessingAvatar ? 'Đang xử lý...' : 'Chọn ảnh'}
                        </span>
                      </label>
                      {avatarPreview && (
                        <button
                          type="button"
                          onClick={() => {
                            setAvatarPreview(null);
                            setAvatarDataUrl(null);
                          }}
                          className="flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[11px] font-bold text-rose-300 transition-colors hover:bg-rose-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Xóa ảnh
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  <label htmlFor="profile-display-name" className="font-bold text-zinc-300">
                    Tên hiển thị
                  </label>
                  <input
                    id="profile-display-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    minLength={1}
                    maxLength={60}
                    required
                    autoComplete="name"
                    className="w-full rounded-xl border border-zinc-800 bg-[#121214] px-3.5 py-3 text-sm font-semibold text-white outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="Tên của bạn"
                  />
                </div>

                {errorMsg && (
                  <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                    {errorMsg}
                  </div>
                )}
                {successMsg && (
                  <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" /> {successMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || isProcessingAvatar || !displayName.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {isLoading ? 'Đang lưu...' : 'Lưu hồ sơ'}
                </button>
              </form>

              <div className="h-px bg-zinc-800" />
              <button
                onClick={handleSignOut}
                disabled={isLoading}
                className="w-full py-2.5 bg-rose-600/10 hover:bg-rose-600/20 text-rose-300 border border-rose-500/20 font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LogOut className="w-4 h-4 text-rose-400" />
                <span>{isLoading ? 'Đang đăng xuất...' : 'Đăng Xuất Tài Khoản'}</span>
              </button>
            </div>
          ) : (
            /* Sign in / Sign up form */
            <div className="space-y-4">
              {supportsOAuth && <div className="grid gap-2">
                <button
                  type="button"
                  disabled={!providers.google}
                  onClick={() => window.location.assign('/api/auth/google')}
                  className="w-full py-3 bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="font-black text-base leading-none">G</span>
                  <span>Tiếp tục với Google</span>
                </button>
                <button
                  type="button"
                  disabled={!providers.apple}
                  onClick={() => window.location.assign('/api/auth/apple')}
                  className="w-full py-3 bg-black hover:bg-zinc-950 text-white border border-zinc-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Apple className="w-4 h-4" />
                  <span>Tiếp tục với Apple</span>
                </button>
              </div>}

              {supportsOAuth && !providers.google && !providers.apple && (
                <p className="text-[11px] text-center text-zinc-500">
                  Đăng nhập Google và Apple sẽ hoạt động sau khi cấu hình OAuth phía server.
                </p>
              )}

              {supportsOAuth ? <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-zinc-600">
                <span className="h-px flex-1 bg-zinc-800" />
                <span>hoặc dùng email</span>
                <span className="h-px flex-1 bg-zinc-800" />
              </div> : <p className="text-center text-xs font-semibold text-zinc-400">Đăng nhập bằng email</p>}

              <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between text-xs font-bold border-b border-zinc-800 pb-2">
                <button
                  type="button"
                  onClick={() => setIsSignUp(false)}
                  className={`pb-1 ${!isSignUp ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-zinc-500'}`}
                >
                  Đăng Nhập
                </button>
                <button
                  type="button"
                  onClick={() => setIsSignUp(true)}
                  className={`pb-1 ${isSignUp ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-zinc-500'}`}
                >
                  Tạo Tài Khoản Mới
                </button>
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs">
                  {errorMsg}
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="space-y-1 text-xs">
                <label className="font-bold text-zinc-300 flex items-center space-x-1">
                  <Mail className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Địa chỉ Email</span>
                </label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-[#121214] border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1 text-xs">
                <label className="font-bold text-zinc-300 flex items-center space-x-1">
                  <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Mật khẩu bảo mật</span>
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3.5 py-2.5 bg-[#121214] border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                <span>{isLoading ? 'Đang xử lý...' : isSignUp ? 'Tạo Tài Khoản Mới' : 'Đăng Nhập Bảo Mật'}</span>
              </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#121214] p-4 border-t border-zinc-800 text-center">
          <button
            onClick={onClose}
            className="text-xs font-bold text-zinc-400 hover:text-white transition-colors"
          >
            Đóng Cửa Sổ
          </button>
        </div>
      </div>
    </div>
  );
};

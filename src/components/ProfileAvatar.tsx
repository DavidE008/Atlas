import { supabase } from "@/integrations/supabase/client";

type ProfileAvatarProps = {
  path: string | null;
  name?: string | null;
  className?: string;
};

export function ProfileAvatar({ path, name, className = "" }: ProfileAvatarProps) {
  const initials = name?.trim().slice(0, 1).toLocaleUpperCase() || "A";
  const imageUrl = path
    ? supabase.storage.from("profile-avatars").getPublicUrl(path).data.publicUrl
    : null;

  return (
    <span className={`profile-avatar ${className}`.trim()} aria-label={name || "Atlas account"}>
      {imageUrl ? <img src={imageUrl} alt="" /> : <span aria-hidden="true">{initials}</span>}
    </span>
  );
}

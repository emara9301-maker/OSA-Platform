// A round profile picture: the photo when there is one, otherwise the initials of the name.
export function Avatar({ name, photoUrl, large = false }: { name: string; photoUrl: string | null; large?: boolean }) {
  const className = large ? "avatar avatar-large" : "avatar";
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={className} src={photoUrl} alt="" />;
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span className={className} aria-hidden="true">
      {initials || "?"}
    </span>
  );
}

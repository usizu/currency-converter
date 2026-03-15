const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 10) return 'just now';
  if (seconds < MINUTE) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / MINUTE);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(seconds / HOUR);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(seconds / DAY);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

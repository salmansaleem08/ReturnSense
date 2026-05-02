/** Fixed mesh behind content — uses `--rs-g*` tokens so gradients shift with light/dark theme. */
export function PageAmbientBg({ subtle }: { subtle?: boolean }) {
  return (
    <div
      className={subtle ? "rs-page-ambient-bg rs-page-ambient-bg--subtle" : "rs-page-ambient-bg"}
      aria-hidden
    />
  );
}

import type { ReactNode } from "react";

export const metadata = {
  title: "TaskBoard OAuth Test Service",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: "3rem auto", maxWidth: 480, padding: "0 1rem" }}>
        {children}
      </body>
    </html>
  );
}

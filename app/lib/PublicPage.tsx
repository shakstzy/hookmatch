import type { ReactNode } from "react";

import styles from "./page.module.css";

// Plain server-rendered shell for the public pages (no App Bridge, no auth).
export function PublicPage({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <a className={styles.brand} href="/">
          Hookmatch
        </a>
        <a href="/support">Support</a>
        <a href="/privacy">Privacy</a>
      </nav>
      {children}
    </main>
  );
}

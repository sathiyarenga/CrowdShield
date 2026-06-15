import styles from "./Header.module.css";
import { ThemeToggle } from "../ThemeToggle";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="app-header">
      <div>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      <div className={styles.headerRight}>
        <ThemeToggle />
        <div className={styles.liveIndicator}>
          <span className={styles.liveDot} />
          <span className={styles.liveText}>Historical Mode</span>
        </div>
      </div>
    </header>
  );
}

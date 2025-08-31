import Link from "next/link";
import ThemeModeToggle from "@/components/ThemeModeToggle";
import { Github, Instagram, Mail } from "lucide-react";

export default function Footer() {
  return (
    <footer className="w-full border-t">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 py-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Kutumb</span>
          <span>·</span>
          <span>Connecting the Hindu community</span>
        </div>

        <nav className="flex items-center gap-4">
          <Link
            href="/about-us"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            About
          </Link>

          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Contact
          </Link>

          <div className="mx-1 h-4 w-px bg-border" />

          <div className="flex items-center gap-3">
            <Link
              href="https://github.com/"
              aria-label="GitHub"
              className="text-muted-foreground hover:text-foreground transition-colors"
              target="_blank"
              rel="noreferrer"
            >
              <Github className="h-4 w-4" />
            </Link>
            <Link
              href="https://instagram.com/"
              aria-label="Instagram"
              className="text-muted-foreground hover:text-foreground transition-colors"
              target="_blank"
              rel="noreferrer"
            >
              <Instagram className="h-4 w-4" />
            </Link>
            <Link
              href="mailto:hello@kutumb.app"
              aria-label="Email"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Mail className="h-4 w-4" />
            </Link>
            <ThemeModeToggle />
          </div>
        </nav>
      </div>

      <div className="container mx-auto pb-6 sm:pb-8">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Kutumb. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

import type { FC, ReactNode } from "react";
import Header from "./Header";
import { ThemeProvider } from "../ThemeProvider";
import Footer from "./Footer";

interface Props {
  children: ReactNode;
}

const Layout: FC<Props> = ({ children }) => {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <div className="flex flex-col justify-start items-start w-full h-full gap-2 min-h-screen">
        <Header />
        <main className="w-full h-full px-2 flex-1">
          <div className="container mx-auto">{children}</div>
        </main>
        <Footer />
      </div>
    </ThemeProvider>
  );
};

export default Layout;

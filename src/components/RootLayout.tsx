import type { ReactNode } from "react";
import Footer from "./Footer";
import Header from "./Header";

interface Props {
	children: ReactNode;
}

export function RootLayout({ children }: Props) {
	return (
		<div className="h-full w-full">
			<Header />
			<main className="h-full w-full px-1">{children}</main>

			<Footer />
		</div>
	);
}

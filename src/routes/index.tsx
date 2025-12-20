import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: App,
});

function App() {
	return (
		<div>
			<h1>Kutumb App</h1>
			<Link to="/test">Test</Link>
		</div>
	);
}

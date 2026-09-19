import { ErrorComponent, Link, rootRouteId, useMatch, useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { isAppError } from "@/domain/errors";

const APP_ERROR_COPY: Record<string, string> = {
	Forbidden: "You don't have permission to do this.",
	NotFound: "We couldn't find what you're looking for.",
	LimitReached: "You've hit a plan limit.",
	NoActiveOrg: "Select an organization first.",
};

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
	const router = useRouter();
	const isRoot = useMatch({
		strict: false,
		select: (state) => state.id === rootRouteId,
	});

	console.error(error);

	if (isAppError(error)) {
		return (
			<div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 p-4">
				<p className="text-lg font-medium">{APP_ERROR_COPY[error.kind] ?? error.message}</p>
				<div className="flex flex-wrap items-center gap-2">
					<Link
						to="/"
						className={`rounded-sm bg-gray-600 px-2 py-1 font-extrabold text-white uppercase dark:bg-gray-700`}
					>
						Home
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 p-4">
			<ErrorComponent error={error} />
			<div className="flex flex-wrap items-center gap-2">
				<button
					onClick={() => {
						router.invalidate();
					}}
					className={`rounded-sm bg-gray-600 px-2 py-1 font-extrabold text-white uppercase dark:bg-gray-700`}
				>
					Try Again
				</button>
				{isRoot ? (
					<Link
						to="/"
						className={`rounded-sm bg-gray-600 px-2 py-1 font-extrabold text-white uppercase dark:bg-gray-700`}
					>
						Home
					</Link>
				) : (
					<Link
						to="/"
						className={`rounded-sm bg-gray-600 px-2 py-1 font-extrabold text-white uppercase dark:bg-gray-700`}
						onClick={(e) => {
							e.preventDefault();
							window.history.back();
						}}
					>
						Go Back
					</Link>
				)}
			</div>
		</div>
	);
}

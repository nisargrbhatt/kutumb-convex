import { authStateFn } from "@/handler/auth";
import { queryOptions } from "@tanstack/react-query";

export const authUserIdQuery = () =>
	queryOptions({
		queryKey: ["auth-user-id"],
		queryFn: async ({ signal }) => {
			const result = await authStateFn({
				signal: signal,
			});
			return result.userId;
		},
	});

import { queryOptions } from "@tanstack/react-query";
import { getMcpUrl } from "@/server/mcpInfo";

export const mcpUrlQuery = () =>
	queryOptions({
		queryKey: ["mcp", "url"] as const,
		queryFn: () => getMcpUrl(),
		staleTime: Infinity,
	});

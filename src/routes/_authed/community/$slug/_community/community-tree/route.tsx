import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/_authed/community/$slug/_community/community-tree',
)({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authed/community/$slug/_community/community-tree"!</div>
}

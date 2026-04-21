import { PostEditor } from "../post-editor";

export default async function EditPostPage(
  props: PageProps<"/admin/posts/[id]">,
) {
  const { id } = await props.params;
  return <PostEditor postId={Number(id)} />;
}

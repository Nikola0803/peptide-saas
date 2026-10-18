const GRAPH = "https://graph.facebook.com/v21.0";

async function gql(path: string, token: string, opts: RequestInit = {}) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH}${path}${sep}access_token=${token}`, opts);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `Graph API error ${res.status}`);
  }
  return data;
}

export async function getAccountInfo(token: string, igUserId: string) {
  return gql(`/${igUserId}?fields=id,username,name,followers_count,biography`, token) as Promise<{
    id: string;
    username: string;
    name: string;
    followers_count: number;
    biography?: string;
  }>;
}

// Send a DM to an Instagram-scoped user ID
export async function sendDM(token: string, igUserId: string, recipientId: string, message: string) {
  return gql(`/${igUserId}/messages`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message },
      messaging_type: "RESPONSE",
    }),
  });
}

// Private reply linked to a comment (appears in DMs as a reply to that comment)
export async function sendPrivateReply(token: string, igUserId: string, commentId: string, message: string) {
  return gql(`/${igUserId}/messages`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text: message },
    }),
  });
}

// Post a public reply on a comment thread
export async function replyToComment(token: string, commentId: string, message: string) {
  return gql(`/${commentId}/replies`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
}

// Verify token and return account info — used when connecting an account
export async function verifyAndFetchAccount(token: string, igUserId: string) {
  return getAccountInfo(token, igUserId);
}

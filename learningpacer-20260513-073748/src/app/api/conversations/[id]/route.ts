import { db } from '@/lib/db';
import { getCurrentUserId } from '@/lib/auth/current-user';

/**
 * Loads a conversation only if the current Supabase user owns it.
 * Returns 404 either way (don't leak existence to other accounts).
 */
async function loadOwned(id: string, userId: string | null) {
  const conv = await db.conversation.findUnique({ where: { id } });
  if (!conv) return null;
  // Match guest-to-guest (both null) or user-to-own (ids equal).
  if ((conv.userId ?? null) !== (userId ?? null)) return null;
  return conv;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getCurrentUserId();
    const owned = await loadOwned(id, userId);
    if (!owned) {
      return Response.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    const conversation = await db.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    return Response.json(conversation);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return Response.json(
      { error: 'Failed to fetch conversation' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getCurrentUserId();
    const owned = await loadOwned(id, userId);
    if (!owned) {
      return Response.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { title } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return Response.json(
        { error: 'Title is required and cannot be empty' },
        { status: 400 }
      );
    }

    if (title.trim().length > 100) {
      return Response.json(
        { error: 'Title must be 100 characters or less' },
        { status: 400 }
      );
    }

    const conversation = await db.conversation.update({
      where: { id },
      data: { title: title.trim() },
    });

    return Response.json(conversation);
  } catch (error) {
    console.error('Error renaming conversation:', error);
    return Response.json(
      { error: 'Failed to rename conversation' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getCurrentUserId();
    const owned = await loadOwned(id, userId);
    if (!owned) {
      return Response.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    await db.message.deleteMany({ where: { conversationId: id } });
    await db.conversation.delete({ where: { id } });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return Response.json(
      { error: 'Failed to delete conversation' },
      { status: 500 }
    );
  }
}

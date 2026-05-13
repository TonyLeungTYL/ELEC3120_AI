import { db } from '@/lib/db';
import { getCurrentUserId } from '@/lib/auth/current-user';

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    // Guests see only guest conversations (userId = null);
    // signed-in users see only their own.
    const conversations = await db.conversation.findMany({
      where: { userId: userId ?? null },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    const convWithCounts = await Promise.all(
      conversations.map(async (conv) => {
        const msgCount = await db.message.count({
          where: { conversationId: conv.id },
        });
        return { ...conv, _count: { messages: msgCount } };
      })
    );

    return Response.json(convWithCounts);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return Response.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = await request.json();
    const { title } = body;

    // Guests can chat too — create a conversation with userId = null.
    const conversation = await db.conversation.create({
      data: {
        title: title || 'New Chat',
        userId: userId ?? null,
      },
    });

    return Response.json(conversation, { status: 201 });
  } catch (error) {
    console.error('Error creating conversation:', error);
    return Response.json(
      { error: 'Failed to create conversation' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const userId = await getCurrentUserId();
    // Guests can clear their own (userId = null) conversations.
    const owned = await db.conversation.findMany({
      where: { userId: userId ?? null },
      select: { id: true },
    });
    const ids = owned.map((c) => c.id);
    if (ids.length > 0) {
      await db.message.deleteMany({ where: { conversationId: { in: ids } } });
      await db.conversation.deleteMany({ where: { id: { in: ids } } });
    }
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error deleting all conversations:', error);
    return Response.json(
      { error: 'Failed to delete all conversations' },
      { status: 500 }
    );
  }
}

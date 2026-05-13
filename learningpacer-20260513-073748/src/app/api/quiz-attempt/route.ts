import { db } from '@/lib/db';
import { getCurrentUserId } from '@/lib/auth/current-user';

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = await request.json();
    const {
      questionId,
      topicId,
      topicName,
      difficulty,
      selectedAnswer,
      correctAnswer,
      isCorrect,
      language,
      questionText,
      selectedAnswerText,
      correctAnswerText,
      explanation,
    } = body;

    if (!questionId || !topicId || !topicName || !difficulty || !selectedAnswer || !correctAnswer || typeof isCorrect !== 'boolean' || !language) {
      return Response.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const attempt = await db.quizAttempt.create({
      data: {
        userId: userId ?? null,
        questionId,
        topicId,
        topicName,
        difficulty,
        selectedAnswer,
        correctAnswer,
        isCorrect,
        language,
        questionText: typeof questionText === 'string' ? questionText.slice(0, 4000) : null,
        selectedAnswerText: typeof selectedAnswerText === 'string' ? selectedAnswerText.slice(0, 1000) : null,
        correctAnswerText: typeof correctAnswerText === 'string' ? correctAnswerText.slice(0, 1000) : null,
        explanation: typeof explanation === 'string' ? explanation.slice(0, 4000) : null,
      },
    });

    return Response.json({ success: true, id: attempt.id });
  } catch (error) {
    console.error('Error saving quiz attempt:', error);
    return Response.json(
      { error: 'Failed to save quiz attempt' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const userId = await getCurrentUserId();
    await db.quizAttempt.deleteMany({ where: { userId: userId ?? null } });
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error resetting quiz attempts:', error);
    return Response.json(
      { error: 'Failed to reset quiz attempts' },
      { status: 500 }
    );
  }
}

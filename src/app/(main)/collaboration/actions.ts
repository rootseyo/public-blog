'use server';

export async function sendSlackInquiry(formData: FormData) {
  const name = formData.get('name') as string;
  const company = formData.get('company') as string;
  const email = formData.get('email') as string;
  const content = formData.get('content') as string;
  const agreement = formData.get('agreement') as string;

  if (!name || !company || !email || !content || agreement !== 'on') {
    return { success: false, error: '모든 필수 항목을 입력하고 개인정보 처리방침에 동의해주세요.' };
  }

  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!slackWebhookUrl) {
    return { success: false, error: '문의 기능이 아직 설정되지 않았습니다.' };
  }

  const message = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🚀 새로운 실무 조력/협업 문의가 도착했습니다!',
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*이름:*\n${name}` },
          { type: 'mrkdwn', text: `*회사:*\n${company}` }
        ]
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*이메일:*\n${email}` }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*문의 내용:*\n${content}`
        }
      },
      {
        type: 'divider'
      }
    ]
  };

  try {
    const response = await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error('슬랙 전송 실패');
    }

    return { success: true };
  } catch (error) {
    console.error('Slack error:', error);
    return { success: false, error: '전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' };
  }
}

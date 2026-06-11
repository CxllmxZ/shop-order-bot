export interface Env {
	DB: D1Database;
	LINE_CHANNEL_SECRET: string;
	LINE_CHANNEL_ACCESS_TOKEN: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Health check
		if (request.method === 'GET' && url.pathname === '/') {
			return new Response('Shop Order Bot is running', { status: 200 });
		}

		// LINE Webhook
		if (request.method === 'POST' && url.pathname === '/webhook') {
			return handleLineWebhook(request, env);
		}

		return new Response('Not Found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;

async function handleLineWebhook(request: Request, env: Env): Promise<Response> {
	// 1. อ่าน body เป็น text (ต้องใช้ raw text สำหรับ verify signature)
	const bodyText = await request.text();
	const signature = request.headers.get('x-line-signature') || '';

	// 2. Verify signature
	const isValid = await verifySignature(bodyText, signature, env.LINE_CHANNEL_SECRET);
	if (!isValid) {
		console.log('Invalid signature');
		return new Response('Unauthorized', { status: 401 });
	}

	// 3. Parse body
	const body = JSON.parse(bodyText);
	console.log('Webhook received:', JSON.stringify(body, null, 2));

	// 4. Loop events
	for (const event of body.events) {
		if (event.type === 'follow') {
			await replyFlex(event.replyToken, getGreetingFlex(), env);
		} else if (event.type === 'message' && event.message.type === 'text') {
			await handleTextMessage(event, env);
		}
	}

	return new Response('OK', { status: 200 });
}

// HMAC-SHA256 signature verification
async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
	const sigArray = new Uint8Array(sigBuffer);

	// แปลงเป็น base64
	let binary = '';
	for (let i = 0; i < sigArray.length; i++) {
		binary += String.fromCharCode(sigArray[i]);
	}
	const computedSignature = btoa(binary);

	return computedSignature === signature;
}

// ส่งข้อความตอบกลับ
async function replyMessage(replyToken: string, text: string, env: Env): Promise<void> {
	const response = await fetch('https://api.line.me/v2/bot/message/reply', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
		},
		body: JSON.stringify({
			replyToken,
			messages: [{ type: 'text', text }],
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.log('LINE API error:', response.status, errorText);
	}
}

// ส่ง Flex Message
async function replyFlex(replyToken: string, flexContent: any, env: Env): Promise<void> {
	const response = await fetch('https://api.line.me/v2/bot/message/reply', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
		},
		body: JSON.stringify({
			replyToken,
			messages: [flexContent],
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.log('LINE Flex API error:', response.status, errorText);
	}
}

// จัดการข้อความ text
async function handleTextMessage(event: any, env: Env): Promise<void> {
	const text = event.message.text.trim();
	const replyToken = event.replyToken;

	// คำสั่งจาก Rich Menu (มี # ขึ้นต้น)
	switch (text) {
		case '#สั่งสินค้า':
			await replyMessage(replyToken, '🛒 กำลังพาไปหน้าสั่งสินค้า...\n\n(เดี๋ยวจะใส่ลิงก์ LIFF ที่นี่)', env);
			return;

		case '#ออเดอร์ของฉัน':
			await replyMessage(replyToken, '📋 ฟีเจอร์นี้กำลังพัฒนา...', env);
			return;

		case '#ติดต่อร้าน':
			await replyMessage(replyToken, '📞 ติดต่อร้านได้ที่:\nLINE: @yourshop\nโทร: 0xx-xxx-xxxx', env);
			return;

		case '#เมนู':
			await replyFlex(replyToken, getGreetingFlex(), env);
			return;
	}

	// ข้อความปกติ (ไม่ใช่คำสั่ง) — echo ไว้ก่อน
	await replyMessage(replyToken, `Echo: ${text}`, env);
}

// Flex ทักทาย
function getGreetingFlex() {
	return {
		type: 'flex',
		altText: 'ยินดีต้อนรับสู่ร้านของเรา',
		contents: {
			type: 'bubble',
			hero: {
				type: 'box',
				layout: 'vertical',
				contents: [
					{
						type: 'text',
						text: '🛍️',
						size: '5xl',
						align: 'center',
					},
				],
				backgroundColor: '#06C755',
				paddingAll: '20px',
			},
			body: {
				type: 'box',
				layout: 'vertical',
				spacing: 'md',
				contents: [
					{
						type: 'text',
						text: 'ยินดีต้อนรับ!',
						weight: 'bold',
						size: 'xl',
						align: 'center',
					},
					{
						type: 'text',
						text: 'ขอบคุณที่เพิ่มเราเป็นเพื่อน 💚',
						size: 'sm',
						color: '#888888',
						align: 'center',
						wrap: true,
					},
					{
						type: 'separator',
						margin: 'md',
					},
					{
						type: 'text',
						text: 'พิมพ์ "เมนู" เพื่อดูคำสั่ง\nหรือกดปุ่มด้านล่างได้เลย',
						size: 'sm',
						color: '#555555',
						align: 'center',
						wrap: true,
						margin: 'md',
					},
				],
			},
			footer: {
				type: 'box',
				layout: 'vertical',
				spacing: 'sm',
				contents: [
					{
						type: 'button',
						style: 'primary',
						color: '#06C755',
						action: {
							type: 'postback',
							label: '🛒 สั่งสินค้า',
							data: 'action=order',
							displayText: 'สั่งสินค้า',
						},
					},
					{
						type: 'button',
						style: 'secondary',
						action: {
							type: 'postback',
							label: '📋 ดูออเดอร์ของฉัน',
							data: 'action=my_orders',
							displayText: 'ดูออเดอร์ของฉัน',
						},
					},
				],
			},
		},
	};
}
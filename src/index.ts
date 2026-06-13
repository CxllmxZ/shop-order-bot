export interface Env {
	shop_order_db: D1Database;
	LINE_CHANNEL_SECRET: string;
	LINE_CHANNEL_ACCESS_TOKEN: string;
	ADMIN_REGISTER_CODE: string;
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

		// LIFF Order Submit ← เพิ่มใหม่
		if (request.method === 'POST' && url.pathname === '/order') {
			return handleOrderSubmit(request, env);
		}

		// CORS preflight ← เพิ่มใหม่
		if (request.method === 'OPTIONS') {
			return handleCors();
		}

		// Admin endpoints (ต้องผ่าน auth)
		if (url.pathname.startsWith('/admin/')) {
			return handleAdminApi(request, env, url);
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
	const userId = event.source.userId;

	if (text.startsWith('ลงทะเบียนแอดมิน')) {
		await handleAdminRegister(text, userId, replyToken, event.source, env);
		return;
	}

	// คำสั่งจาก Rich Menu (มี # ขึ้นต้น)
	switch (text) {
		case '#สั่งสินค้า':
			await replyFlex(replyToken, getOrderButtonFlex(), env);
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
		
		case '#dashboard':
		case '#แดชบอร์ด':
			await replyMessage(replyToken, 'เปิด Dashboard:\nhttps://liff.line.me/2010382835-4SH11vbP', env);
			return;
	}

	// ข้อความปกติ (ไม่ใช่คำสั่ง) — echo ไว้ก่อน
	await replyMessage(replyToken, `Echo: ${text}`, env);
}

// CORS headers (ให้ LIFF เรียก Worker ได้)
function corsHeaders() {
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, X-LINE-User-Id',
	};
}

function handleCors(): Response {
	return new Response(null, { status: 204, headers: corsHeaders() });
}

// รับ order จาก LIFF
async function handleOrderSubmit(request: Request, env: Env): Promise<Response> {
	try {
		const data = await request.json() as {
			userId: string;
			displayName: string;
			product: string;
			quantity: number;
			totalPrice: number;
			name: string;
			phone: string;
			address: string;
		};

		// Validate
		if (!data.userId || !data.product || !data.quantity || !data.name || !data.phone || !data.address) {
			return jsonResponse({ error: 'Missing required fields' }, 400);
		}

		// สร้าง order_code unique
		const orderCode = await generateOrderCode(env);

		// INSERT ลง D1
		const result = await env.shop_order_db.prepare(
			`INSERT INTO orders (
				customer_user_id, customer_name, customer_phone, customer_address,
				product, quantity, total_price, status, created_at, order_code
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).bind(
			data.userId,
			data.name,
			data.phone,
			data.address,
			data.product,
			data.quantity,
			data.totalPrice,
			'pending',
			Date.now(),
			orderCode
		).run();
		
		const orderId = result.meta.last_row_id;

		// Push Flex ยืนยันให้ลูกค้า
		await pushFlex(data.userId, getOrderConfirmFlex(orderCode, data), env);

		// ⭐ เพิ่ม: Push แจ้ง admin ทุกคน
		await notifyAdmins(orderCode, data, env);

		return jsonResponse({ success: true, orderId, orderCode }, 200);
	} catch (err: any) {
		console.log('Order submit error:', err.message);
		return jsonResponse({ error: err.message }, 500);
	}
}

// Helper สำหรับ JSON response
function jsonResponse(data: any, status: number): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			...corsHeaders(),
		},
	});
}

// Push Flex ไปยัง user (ใช้ตอน submit form เสร็จ)
async function pushFlex(userId: string, flexContent: any, env: Env): Promise<void> {
	const response = await fetch('https://api.line.me/v2/bot/message/push', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
		},
		body: JSON.stringify({
			to: userId,
			messages: [flexContent],
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.log('LINE Push API error:', response.status, errorText);
	}
}

// Flex ยืนยันออเดอร์
function getOrderConfirmFlex(orderCode: string, data: any) {
	return {
		type: 'flex',
		altText: `ยืนยันออเดอร์ #${orderCode}`,
		contents: {
			type: 'bubble',
			header: {
				type: 'box',
				layout: 'vertical',
				backgroundColor: '#06C755',
				paddingAll: '15px',
				contents: [
					{
						type: 'text',
						text: '✅ ได้รับออเดอร์แล้ว',
						color: '#FFFFFF',
						weight: 'bold',
						size: 'lg',
					},
					{
						type: 'text',
						text: `เลขออเดอร์ #${orderCode}`,
						color: '#FFFFFF',
						size: 'sm',
						margin: 'sm',
					},
				],
			},
			body: {
				type: 'box',
				layout: 'vertical',
				spacing: 'sm',
				contents: [
					{
						type: 'box',
						layout: 'horizontal',
						contents: [
							{ type: 'text', text: 'สินค้า', size: 'sm', color: '#888888', flex: 2 },
							{ type: 'text', text: data.product, size: 'sm', flex: 3, wrap: true },
						],
					},
					{
						type: 'box',
						layout: 'horizontal',
						contents: [
							{ type: 'text', text: 'จำนวน', size: 'sm', color: '#888888', flex: 2 },
							{ type: 'text', text: `${data.quantity} ชิ้น`, size: 'sm', flex: 3 },
						],
					},
					{
						type: 'box',
						layout: 'horizontal',
						contents: [
							{ type: 'text', text: 'ผู้สั่ง', size: 'sm', color: '#888888', flex: 2 },
							{ type: 'text', text: data.name, size: 'sm', flex: 3, wrap: true },
						],
					},
					{
						type: 'box',
						layout: 'horizontal',
						contents: [
							{ type: 'text', text: 'เบอร์', size: 'sm', color: '#888888', flex: 2 },
							{ type: 'text', text: data.phone, size: 'sm', flex: 3 },
						],
					},
					{ type: 'separator', margin: 'md' },
					{
						type: 'box',
						layout: 'horizontal',
						margin: 'md',
						contents: [
							{ type: 'text', text: 'ยอดรวม', weight: 'bold', flex: 2 },
							{
								type: 'text',
								text: `${data.totalPrice.toLocaleString()} ฿`,
								weight: 'bold',
								color: '#06C755',
								align: 'end',
								flex: 3,
							},
						],
					},
				],
			},
			footer: {
				type: 'box',
				layout: 'vertical',
				contents: [
					{
						type: 'text',
						text: 'เราจะติดต่อกลับเร็วๆ นี้',
						size: 'xs',
						color: '#888888',
						align: 'center',
					},
				],
			},
		},
	};
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

// Flex ปุ่มเปิด LIFF
function getOrderButtonFlex() {
	return {
		type: 'flex',
		altText: 'กดเพื่อเปิดหน้าสั่งสินค้า',
		contents: {
			type: 'bubble',
			body: {
				type: 'box',
				layout: 'vertical',
				spacing: 'md',
				contents: [
					{
						type: 'text',
						text: '🛒 สั่งสินค้า',
						weight: 'bold',
						size: 'xl',
						align: 'center',
					},
					{
						type: 'text',
						text: 'กดปุ่มด้านล่างเพื่อเปิดฟอร์มสั่งซื้อ',
						size: 'sm',
						color: '#888888',
						align: 'center',
						wrap: true,
					},
				],
			},
			footer: {
				type: 'box',
				layout: 'vertical',
				contents: [
					{
						type: 'button',
						style: 'primary',
						color: '#06C755',
						action: {
							type: 'uri',
							label: 'เปิดฟอร์มสั่งสินค้า',
							uri: 'https://liff.line.me/2010382835-nqgQ8M2r',
						},
					},
				],
			},
		},
	};
}

// ลงทะเบียน admin
async function handleAdminRegister(
	text: string,
	userId: string,
	replyToken: string,
	source: any,
	env: Env
): Promise<void> {
	// Parse: "ลงทะเบียนแอดมิน [code]"
	const parts = text.split(/\s+/);
	if (parts.length < 2) {
		await replyMessage(replyToken, '❌ รูปแบบไม่ถูกต้อง\n\nใช้: ลงทะเบียนแอดมิน [รหัส]', env);
		return;
	}

	const code = parts.slice(1).join(' '); // เผื่อรหัสมีช่องว่าง

	// ตรวจรหัส
	if (code !== env.ADMIN_REGISTER_CODE) {
		await replyMessage(replyToken, '❌ รหัสไม่ถูกต้อง', env);
		return;
	}

	// เช็คว่าลงทะเบียนแล้วหรือยัง
	const existing = await env.shop_order_db.prepare(
		'SELECT user_id FROM admins WHERE user_id = ?'
	).bind(userId).first();

	if (existing) {
		await replyMessage(replyToken, '✅ คุณเป็น admin อยู่แล้ว', env);
		return;
	}

	// ดึงชื่อจาก LINE Profile API
	let displayName = 'Admin';
	try {
		const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
			headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
		});
		if (profileRes.ok) {
			const profile = await profileRes.json() as any;
			displayName = profile.displayName || 'Admin';
		}
	} catch (err) {
		console.log('Get profile failed:', err);
	}

	// INSERT admin
	await env.shop_order_db.prepare(
		'INSERT INTO admins (user_id, name, registered_at) VALUES (?, ?, ?)'
	).bind(userId, displayName, Date.now()).run();

	await replyMessage(
		replyToken,
		`🎉 ลงทะเบียนสำเร็จ!\n\nสวัสดี ${displayName}\nคุณจะได้รับแจ้งเตือนเมื่อมีออเดอร์ใหม่`,
		env
	);
}

// Push แจ้งเตือน admin ทุกคน
async function notifyAdmins(orderCode: string, data: any, env: Env): Promise<void> {
	const admins = await env.shop_order_db.prepare('SELECT user_id FROM admins').all();

	if (!admins.results || admins.results.length === 0) {
		console.log('No admins registered');
		return;
	}

	const flex = getAdminAlertFlex(orderCode, data);

	// Push ทีละคน (LINE multicast มีข้อจำกัด เลยใช้ push)
	for (const admin of admins.results as any[]) {
		await pushFlex(admin.user_id, flex, env);
	}
}

// Flex แจ้ง admin
function getAdminAlertFlex(orderCode: string, data: any) {
	return {
		type: 'flex',
		altText: `🔔 ออเดอร์ใหม่ #${orderCode}`,
		contents: {
			type: 'bubble',
			header: {
				type: 'box',
				layout: 'vertical',
				backgroundColor: '#FF6B35',
				paddingAll: '15px',
				contents: [
					{
						type: 'text',
						text: '🔔 ออเดอร์ใหม่!',
						color: '#FFFFFF',
						weight: 'bold',
						size: 'lg',
					},
					{
						type: 'text',
						text: `#${orderCode}`,
						color: '#FFFFFF',
						size: 'sm',
						margin: 'sm',
					},
				],
			},
			body: {
				type: 'box',
				layout: 'vertical',
				spacing: 'sm',
				contents: [
					{
						type: 'box',
						layout: 'horizontal',
						contents: [
							{ type: 'text', text: 'สินค้า', size: 'sm', color: '#888888', flex: 2 },
							{ type: 'text', text: data.product, size: 'sm', flex: 3, wrap: true },
						],
					},
					{
						type: 'box',
						layout: 'horizontal',
						contents: [
							{ type: 'text', text: 'จำนวน', size: 'sm', color: '#888888', flex: 2 },
							{ type: 'text', text: `${data.quantity} ชิ้น`, size: 'sm', flex: 3 },
						],
					},
					{ type: 'separator', margin: 'md' },
					{
						type: 'text',
						text: '👤 ลูกค้า',
						size: 'sm',
						weight: 'bold',
						margin: 'md',
					},
					{
						type: 'box',
						layout: 'horizontal',
						contents: [
							{ type: 'text', text: 'ชื่อ', size: 'sm', color: '#888888', flex: 2 },
							{ type: 'text', text: data.name, size: 'sm', flex: 3, wrap: true },
						],
					},
					{
						type: 'box',
						layout: 'horizontal',
						contents: [
							{ type: 'text', text: 'เบอร์', size: 'sm', color: '#888888', flex: 2 },
							{
								type: 'text',
								text: data.phone,
								size: 'sm',
								flex: 3,
								color: '#0066CC',
								action: { type: 'uri', uri: `tel:${data.phone}` },
							},
						],
					},
					{
						type: 'box',
						layout: 'horizontal',
						contents: [
							{ type: 'text', text: 'ที่อยู่', size: 'sm', color: '#888888', flex: 2 },
							{ type: 'text', text: data.address, size: 'sm', flex: 3, wrap: true },
						],
					},
					{ type: 'separator', margin: 'md' },
					{
						type: 'box',
						layout: 'horizontal',
						margin: 'md',
						contents: [
							{ type: 'text', text: 'ยอดรวม', weight: 'bold', flex: 2 },
							{
								type: 'text',
								text: `${data.totalPrice.toLocaleString()} ฿`,
								weight: 'bold',
								color: '#06C755',
								align: 'end',
								flex: 3,
							},
						],
					},
				],
			},
		},
	};
}

// ==================== ADMIN API ====================
async function handleAdminApi(request: Request, env: Env, url: URL): Promise<Response> {
	// CORS preflight
	if (request.method === 'OPTIONS') {
		return handleCors();
	}

	// Auth check
	const userId = request.headers.get('X-LINE-User-Id');
	if (!userId) {
		return jsonResponse({ error: 'Unauthorized: missing user id' }, 401);
	}

	const admin = await env.shop_order_db.prepare(
		'SELECT user_id, name FROM admins WHERE user_id = ?'
	).bind(userId).first();

	if (!admin) {
		return jsonResponse({ error: 'Forbidden: not an admin' }, 403);
	}

	// Route
	const path = url.pathname;

	if (request.method === 'GET' && path === '/admin/me') {
		return jsonResponse({ userId: admin.user_id, name: admin.name }, 200);
	}

	if (request.method === 'GET' && path === '/admin/stats') {
		return handleAdminStats(env);
	}

	if (request.method === 'GET' && path === '/admin/orders') {
		return handleAdminOrdersList(url, env);
	}

	// PATCH /admin/orders/:id
	const updateMatch = path.match(/^\/admin\/orders\/(\d+)$/);
	if (request.method === 'PATCH' && updateMatch) {
		const orderId = parseInt(updateMatch[1]);
		return handleAdminOrderUpdate(orderId, request, env);
	}

	return jsonResponse({ error: 'Not Found' }, 404);
}

// GET /admin/stats
async function handleAdminStats(env: Env): Promise<Response> {
	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);
	const todayMs = todayStart.getTime();

	const monthStart = new Date();
	monthStart.setDate(1);
	monthStart.setHours(0, 0, 0, 0);
	const monthMs = monthStart.getTime();

	// Today (excl. cancelled)
	const today = await env.shop_order_db.prepare(
		`SELECT COUNT(*) as count, COALESCE(SUM(total_price), 0) as total
		 FROM orders WHERE created_at >= ? AND status != 'cancelled'`
	).bind(todayMs).first() as any;

	// Month (excl. cancelled)
	const month = await env.shop_order_db.prepare(
		`SELECT COUNT(*) as count, COALESCE(SUM(total_price), 0) as total
		 FROM orders WHERE created_at >= ? AND status != 'cancelled'`
	).bind(monthMs).first() as any;

	// Pending
	const pending = await env.shop_order_db.prepare(
		`SELECT COUNT(*) as count, MIN(created_at) as oldest
		 FROM orders WHERE status = 'pending'`
	).first() as any;

	// Counts per status (สำหรับ filter pills)
	const counts = await env.shop_order_db.prepare(
		`SELECT status, COUNT(*) as count FROM orders GROUP BY status`
	).all();

	const countsMap: Record<string, number> = { all: 0 };
	let totalAll = 0;
	for (const row of (counts.results || []) as any[]) {
		countsMap[row.status] = row.count;
		totalAll += row.count;
	}
	countsMap.all = totalAll;

	return jsonResponse({
		today: { count: today.count, total: today.total },
		month: { count: month.count, total: month.total },
		pending: { count: pending.count, oldest: pending.oldest },
		counts: countsMap,
	}, 200);
}

// GET /admin/orders
async function handleAdminOrdersList(url: URL, env: Env): Promise<Response> {
	const params = url.searchParams;
	const status = params.get('status') || 'all';
	const search = params.get('search') || '';
	const sort = params.get('sort') || 'new';
	const page = Math.max(1, parseInt(params.get('page') || '1'));
	const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '20')));
	const offset = (page - 1) * limit;

	// Build WHERE clause
	const conditions: string[] = [];
	const bindings: any[] = [];

	if (status !== 'all') {
		conditions.push('status = ?');
		bindings.push(status);
	}

	if (search.trim()) {
		const s = `%${search.trim()}%`;
		conditions.push('(customer_name LIKE ? OR customer_phone LIKE ? OR order_code LIKE ?)');
		bindings.push(s, s, s);
	}

	const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

	// ORDER BY
	let orderBy = 'created_at DESC';
	if (sort === 'old') orderBy = 'created_at ASC';
	else if (sort === 'high') orderBy = 'total_price DESC';
	else if (sort === 'low') orderBy = 'total_price ASC';

	// Count total
	const totalRow = await env.shop_order_db.prepare(
		`SELECT COUNT(*) as count FROM orders ${where}`
	).bind(...bindings).first() as any;
	const total = totalRow.count;

	// Fetch page
	const result = await env.shop_order_db.prepare(
		`SELECT * FROM orders ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
	).bind(...bindings, limit, offset).all();

	return jsonResponse({
		orders: result.results || [],
		total,
		page,
		limit,
		hasMore: offset + limit < total,
	}, 200);
}

// PATCH /admin/orders/:id
async function handleAdminOrderUpdate(orderId: number, request: Request, env: Env): Promise<Response> {
	const body = await request.json() as { status?: string };
	const validStatuses = ['pending', 'confirmed', 'shipped', 'completed', 'cancelled'];

	if (!body.status || !validStatuses.includes(body.status)) {
		return jsonResponse({ error: 'Invalid status' }, 400);
	}

	// Validate transition
	const order = await env.shop_order_db.prepare('SELECT status FROM orders WHERE id = ?').bind(orderId).first() as any;
	if (!order) {
		return jsonResponse({ error: 'Order not found' }, 404);
	}

	const transitions: Record<string, string[]> = {
		pending: ['confirmed', 'cancelled'],
		confirmed: ['shipped', 'cancelled'],
		shipped: ['completed'],
		completed: [],
		cancelled: [],
	};

	const allowed = transitions[order.status] || [];
	if (!allowed.includes(body.status)) {
		return jsonResponse({
			error: `Cannot change from "${order.status}" to "${body.status}"`,
		}, 400);
	}

	// Update
	await env.shop_order_db.prepare(
		'UPDATE orders SET status = ? WHERE id = ?'
	).bind(body.status, orderId).run();

	return jsonResponse({ success: true, orderId, newStatus: body.status }, 200);
}

// สร้าง order_code 6 หลัก unique
async function generateOrderCode(env: Env): Promise<string> {
	const MAX_ATTEMPTS = 10;

	for (let i = 0; i < MAX_ATTEMPTS; i++) {
		// Random 100000-999999
		const code = Math.floor(100000 + Math.random() * 900000).toString();

		// เช็คว่าซ้ำไหม
		const existing = await env.shop_order_db.prepare(
			'SELECT id FROM orders WHERE order_code = ?'
		).bind(code).first();

		if (!existing) return code;
	}

	throw new Error('Failed to generate unique order code after ' + MAX_ATTEMPTS + ' attempts');
}
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, history = [], fileName = '', fileContent = '' } = req.body;
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    const sheetUrl = (process.env.GOOGLE_SHEET_URL || '').trim();

    if (!apiKey) {
      return res.status(500).json({ error: 'Chưa cấu hình biến GEMINI_API_KEY trên Vercel.' });
    }

    let systemInstruction = "Bạn là trợ lý AI giáo dục của dự án SAFE NET 4A. Hãy trả lời thân thiện, chính xác và dễ hiểu bằng tiếng Việt.";
    if (fileContent) {
      systemInstruction += `\n\nNgười dùng đã tải lên tài liệu tên là "${fileName}". Hãy ưu tiên sử dụng thông tin trong tài liệu dưới đây để trả lời câu hỏi. Nếu tài liệu không có thông tin, hãy nói rõ và hỗ trợ theo kiến thức chuẩn:\n--- NỘI DUNG TÀI LIỆU ---\n${fileContent.slice(0, 30000)}\n--- HẾT TÀI LIỆU ---`;
    }

    const contents = [
      ...history.map(item => ({
        role: item.role === 'user' ? 'user' : 'model',
        parts: [{ text: item.text }]
      })),
      { role: 'user', parts: [{ text: message }] }
    ];

    // Ghép từng phần URL để đảm bảo không bị trình duyệt rút gọn nhầm khi copy
    const host = "://googleapis.com";
    const path = "/v1beta/models/gemini-2.5-flash:generateContent";
    const geminiUrl = `https://${host}${path}?key=${encodeURIComponent(apiKey)}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: contents
      })
    });

    const data = await geminiRes.json();

    if (data.error) {
      return res.status(500).json({ error: 'Lỗi từ Gemini API: ' + data.error.message });
    }

    const reply = data?.candidates?.at(0)?.content?.parts?.at(0)?.text || "Xin lỗi, AI chưa thể phản hồi lúc này.";

    if (sheetUrl && sheetUrl.startsWith('http')) {
      await fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: fileName,
          question: message,
          answer: reply,
          contextSnippet: fileContent ? fileContent.slice(0, 150) + "..." : ""
        })
      }).catch(err => console.error("Lỗi ghi Google Sheet:", err));
    }

    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(500).json({ error: 'Lỗi hệ thống backend: ' + error.message });
  }
}

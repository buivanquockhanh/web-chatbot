export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, history = [], fileName = '', fileContent = '' } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    const sheetUrl = process.env.GOOGLE_SHEET_URL;

    if (!apiKey) {
      return res.status(500).json({ error: 'Chưa cấu hình GEMINI_API_KEY trên Vercel' });
    }

    let systemInstruction = "Bạn là trợ lý AI giáo dục của dự án SAFE NET 4A. Hãy trả lời thân thiện, chính xác và dễ hiểu bằng tiếng Việt.";
    if (fileContent) {
      systemInstruction += `\n\nNgười dùng đã tải lên tài liệu tên là "${fileName}". Hãy ưu tiên sử dụng thông tin trong tài liệu dưới đây để trả lời:\n--- TÀI LIỆU ---\n${fileContent.slice(0, 30000)}\n--- HẾT ---`;
    }

    const contents = [
      ...history.map(item => ({
        role: item.role === 'user' ? 'user' : 'model',
        parts: [{ text: item.text }]
      })),
      { role: 'user', parts: [{ text: message }] }
    ];

    const geminiRes = await fetch(
      `https://googleapis.com{apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents
        })
      }
    );

    const data = await geminiRes.json();

    // Nếu Google trả về lỗi (ví dụ sai API Key), hiển thị thẳng lý do lên màn hình chat
    if (data.error) {
      return res.status(500).json({ error: 'Lỗi từ Gemini API: ' + data.error.message });
    }

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Xin lỗi, AI chưa thể phản hồi lúc này.";

    if (sheetUrl) {
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
    return res.status(500).json({ error: 'Lỗi server: ' + error.message });
  }
}

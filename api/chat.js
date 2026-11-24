export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, history = [], fileName = '', fileContent = '' } = req.body;
    const groqKey = (process.env.GROQ_API_KEY || '').trim();
    const sheetUrl = (process.env.GOOGLE_SHEET_URL || '').trim();

    if (!groqKey) {
      return res.status(500).json({ error: 'Chưa cấu hình biến GROQ_API_KEY trên Vercel.' });
    }

    let systemPrompt = "Bạn là trợ lý AI giáo dục của dự án SAFE NET 4A. Hãy trả lời thân thiện, ngắn gọn, chính xác và dễ hiểu bằng tiếng Việt.\n" +
      "QUY TẮC TRÌNH BÀY BẮT BUỘC:\n" +
      "1. Không dùng ký tự Markdown như dấu thăng (#), dấu sao (**), dấu gạch đầu dòng (-) hay kẻ bảng (|). Dùng số thứ tự (1., 2.) và dấu chấm tròn (•).\n" +
      "2. Với công thức toán học và vật lý: KHÔNG dùng mã LaTeX ($ hoặc \\) và KHÔNG viết dấu mũ thô như 10^-3 hay q^2. Bắt buộc viết bằng ký tự Unicode chuẩn đẹp mắt (ví dụ: 10⁻³, °C⁻¹, q², m/s², R₀, T₀, α, ρ, τ, ΔT).";

    if (fileContent) {
      systemPrompt += `\n\nNgười dùng đã tải lên tài liệu tên là "${fileName}". Hãy ưu tiên sử dụng thông tin trong tài liệu dưới đây để trả lời câu hỏi. Nếu tài liệu không có thông tin, hãy nói rõ và hỗ trợ theo kiến thức chuẩn:\n--- NỘI DUNG TÀI LIỆU ---\n${fileContent.slice(0, 25000)}\n--- HẾT TÀI LIỆU ---`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(item => ({
        role: item.role === 'user' ? 'user' : 'assistant',
        content: item.text
      })),
      { role: 'user', content: message }
    ];

    const host = "api" + ".groq" + ".com";
    const path = "/openai/v1/chat/completions";
    const groqUrl = "https" + "://" + host + path;

    const groqModels = [
      "openai/gpt-oss-120b",
      "qwen/qwen3.8-27b",
      "openai/gpt-oss-20b"
    ];

    let data = null;
    let lastError = "";

    for (const modelName of groqModels) {
      const aiRes = await fetch(groqUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + groqKey
        },
        body: JSON.stringify({
          model: modelName,
          messages: messages,
          temperature: 0.7
        })
      });

      data = await aiRes.json();

      if (!data.error) {
        break;
      }
      lastError = data.error.message;
    }

    if (data && data.error) {
      return res.status(500).json({ error: 'Lỗi từ Groq AI: ' + lastError });
    }

    let rawReply = data?.choices?.at(0)?.message?.content || "Xin lỗi, AI chưa thể phản hồi lúc này.";

    // Bộ lọc làm sạch Markdown và tự động chuyển đổi số mũ thô (nếu AI lỡ viết) sang số mũ đẹp
    const supMap = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '⁺' };
    const reply = rawReply
      .replace(/^#+\s*/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/^\s*[-*]\s+/gm, '• ')
      .replace(/\|[-:\s]+\|/g, '')
      .replace(/\|/g, ' - ')
      .replace(/\^(-?[0-9+]+)/g, (_, exp) => exp.split('').map(c => supMap[c] || c).join(''))
      .replace(/\n{3,}/g, '\n\n')
      .trim();

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

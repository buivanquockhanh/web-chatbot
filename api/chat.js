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

    let systemPrompt = "Bạn là trợ lý AI giáo dục và tâm lý học đường của dự án SAFE NET 4A (THPT Mộ Đức).\n" +
      "QUY TẮC TRÌNH BÀY CÂU TRẢ LỜI BẮT BUỘC:\n" +
      "1. Mở đầu bằng một câu đồng cảm hoặc tóm tắt ngắn gọn (1–2 câu), sau đó xuống dòng cách 1 dòng trống.\n" +
      "2. Chia nội dung chính thành các mục đánh số (1., 2., 3...) hoặc các ý gạch đầu dòng rõ ràng. Mỗi mục phải có phần tiêu đề ngắn được đặt trong cặp dấu sao **Tiêu đề:** rồi mới đến nội dung giải thích. Giữa các mục lớn nên xuống dòng thoáng để học sinh dễ đọc.\n" +
      "3. Tuyệt đối không dùng dấu thăng (#) hay kẻ bảng (|). Nếu có ý phụ bên trong một mục, hãy xuống dòng và thụt vào với dấu chấm tròn (•).\n" +
      "4. Kết thúc bằng một lời động viên ấm áp hoặc câu hỏi gợi mở ngắn gọn ở đoạn riêng cuối cùng.\n" +
      "5. Với công thức toán học, vật lý, hóa học: Luôn đặt trong cặp dấu đô-la $...$ hoặc $$...$$.";

    if (fileContent) {
      systemPrompt += `\n\nNgười dùng đã tải lên tài liệu tên là "${fileName}". Hãy ưu tiên sử dụng thông tin trong tài liệu dưới đây để trả lời câu hỏi. Nếu tài liệu không có thông tin, hãy nói rõ và hỗ trợ theo kiến thức chuẩn:\n--- NỘI DUNG TÀI LIỆU ---\n${fileContent.slice(0, 25000)}\n--- HẾT TÀI LIỆU ---`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(item => ({
        role: item.role === 'user' ? 'user' : 'assistant',
        content: item.text || item.content || ''
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
          temperature: 0.55
        })
      });

      data = await aiRes.json();
      if (!data.error) break;
      lastError = data.error.message;
    }

    if (data && data.error) {
      return res.status(500).json({ error: 'Lỗi từ Groq AI: ' + lastError });
    }

    let rawReply = data?.choices?.at(0)?.message?.content || "Xin lỗi, AI chưa thể phản hồi lúc này.";

    // Làm sạch định dạng: giữ lại **in đậm**, tách dòng thoáng, sửa lỗi dấu chấm tròn dính sau dấu hai chấm
    const reply = rawReply
      .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
      .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$')
      .replace(/^#+\s*(.*)$/gm, '**$1**')     // Biến tiêu đề # thành chữ **in đậm**
      .replace(/:\s*[•\-*]\s*/g, ': ')        // Xóa dấu chấm tròn bị dính ngay sau dấu hai chấm
      .replace(/^\s*[-*]\s+/gm, '  • ')       // Thụt lề gọn gàng cho các ý phụ đầu dòng
      .replace(/\|[-:\s]+\|/g, '')
      .replace(/\|/g, ' - ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (sheetUrl && sheetUrl.startsWith('http')) {
      const cleanSheetAnswer = reply.replace(/\*\*/g, '').replace(/\$\$?/g, '');
      await fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: fileName,
          question: message,
          answer: cleanSheetAnswer,
          contextSnippet: fileContent ? fileContent.slice(0, 150) + "..." : ""
        })
      }).catch(err => console.error("Lỗi ghi Google Sheet:", err));
    }

    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(500).json({ error: 'Lỗi hệ thống backend: ' + error.message });
  }
}

# Thiết kế: LangChain cho luồng Khám phá thị trường

## Mục tiêu

Thay orchestration cố định `Tavily → completeTextWithProvider → parse JSON` của market discovery bằng agent LangChain có nhiều vòng tool/LLM, structured output và stream events, đồng thời giữ nguyên feed, snapshot, cooldown, OAuth/private transport và trace `.json.gz` hiện có.

## Phạm vi

- Chỉ thay luồng server của market discovery; không thay OAuth login, mã hóa credential, preferences, snapshot/feed hoặc các route public ngoài phần refresh/progress.
- Dùng `createAgent` của LangChain với các tool server-side `tavily.search_market_sources` và `tavily.extract_market_sources`.
- Dùng schema Zod cho output cơ hội. Kết quả cuối vẫn được kiểm tra lại bằng validator domain hiện có để bảo vệ database và source IDs.
- API-key provider dùng `ChatOpenAI` với base URL đã validate trong provider repository.
- OAuth provider dùng chính cấu hình đã kiểm chứng ở Smart Stock: `ChatOpenAI({ useResponsesApi: true, configuration.baseURL: "https://chatgpt.com/backend-api/codex", defaultHeaders: { "OpenAI-Beta": "responses=v1" }, modelKwargs: { store: false } })`. Adapter không đọc token ở client và không đổi endpoint private.
- Map `streamEvents` thành các span v2 hiện có: `agent`, `event`, `llm_call`, `tool_call`; giữ các preview đã redact và không ghi chain-of-thought ẩn.

## Luồng đề xuất

1. `refresh` lấy provider, preferences và snapshot như hiện tại.
2. Agent nhận task khám phá cùng preferences và ngày hiện tại. Prompt yêu cầu lập góc tìm kiếm theo nhu cầu, sản phẩm/đối thủ và tín hiệu chính sách; không nhồi sẵn ba query cố định.
3. Agent gọi `tavily.search_market_sources` nhiều lần, tối đa 6 lần/run và tối đa 3 lần song song ở mỗi lượt. Tool bắt buộc nhận `topic` và `timeRange`; mặc định ưu tiên `news`/`general` trong `month`, có thể mở rộng `year` nếu dữ liệu mới quá ít. Kết quả giữ `publishedAt`, `fetchedAt`, URL và domain.
4. Agent có thể gọi `tavily.extract_market_sources` tối đa 3 URL nguồn tốt nhất để lấy bằng chứng sâu hơn, nhưng giới hạn output và không lưu raw HTML.
5. Agent lặp lại model/tool cho đến khi đủ bằng chứng hoặc đạt giới hạn, sau đó trả `structuredResponse.opportunities`. Đây là lý do trace sẽ có nhiều `llm_call` và `tool_call` thật; không tạo span giả.
6. Domain validator kiểm tra số lượng cơ hội, trường bắt buộc, confidence và source IDs.
7. Repository lưu snapshot/run/trace theo logic hiện tại; UI nhận progress và feed cũ theo cơ chế hiện có.

## Adapter và bảo mật

- Không đưa `ChatOpenAI` trực tiếp vào route; model factory nhận provider đã được xác thực.
- API-key path giữ DNS/IP/HTTPS validation hiện tại.
- OAuth path giữ `chatgpt.com/backend-api/codex/responses`, `store: false`, timeout và giới hạn response hiện tại; không gửi `max_output_tokens` cho OAuth. Cấu hình LangChain bám Smart Stock thay vì tự ghép body Responses.
- LangChain callback metadata chỉ chứa provider type/model, run IDs, query đã redact, result counts, durations và lỗi bounded.
- Không lưu system/developer prompt, credential, access token hay hidden chain-of-thought. Application prompt hiện tại chỉ lưu bản redact theo trace contract.

## Trace và streaming

- `on_chain_start/end/error`, `on_tool_start/end/error` và `on_chat_model_start/end` được chuẩn hóa vào trace v2.
- Mỗi tool invocation có span riêng; mỗi model turn có `llm_call` riêng. Không tạo span giả cho các bước progress.
- `streamEvents` cập nhật progress callback hiện tại (`provider`, `sources`, `synthesis`, `saving`, `complete`) để không đổi contract UI.
- Export giữ top-level `{ exported_at, trace, spans }`, nén `.json.gz`.

## Files dự kiến

- `apps/web/package.json`, workspace lockfile: thêm dependency LangChain tối thiểu.
- `apps/web/src/_entities/market-discovery/server/market-discovery-agent.ts`: tools, schema, model factory, agent runner và event mapper.
- `apps/web/src/_entities/market-discovery/server/market-discovery-service.ts`: gọi agent runner, bỏ orchestration synthesis trực tiếp, giữ domain validation/repository.
- `apps/web/src/_entities/ai-provider/server/complete-text.ts`: giữ nguyên cho luồng competitor và các caller khác; market discovery không gọi helper này nữa.
- `apps/web/src/_entities/market-discovery/server/tavily-search.ts`: thêm tùy chọn query/topic/time range/extract và vẫn giữ bounds, validation, dedup.
- `apps/web/src/_entities/market-discovery/model/market-discovery-trace.ts`: bổ sung mapping metadata nếu event LangChain cần, không đổi export contract.
- Tests server cho tool bounds, provider model factory, structured output, agent loop và trace span counts.

## Chính sách nguồn mới

- Agent luôn nhận ngày hiện tại trong system prompt.
- Tool dùng `include_published_date: true`; dùng `time_range`/`start_date` để ưu tiên nguồn mới nhưng giữ nguồn không có ngày với nhãn thiếu ngày thay vì gọi chúng là mới nhất.
- Dùng `topic: news` cho diễn biến mới và `topic: general` cho báo cáo/thị trường; ngôn ngữ và country ưu tiên theo market preference.
- Không dùng `include_answer` hoặc raw content trong search để tránh trả thêm một LLM summary và phình context; chỉ extract URL khi cần kiểm chứng.
- Mỗi cơ hội phải trỏ về source IDs; prompt yêu cầu nêu ngày nguồn và phân biệt dữ kiện với suy luận.

## Ngoài phạm vi

- LangSmith/remote tracing, persistence/checkpoint ngoài database hiện tại.
- General-purpose subagents, file tools, web browser tools hoặc khả năng tự do ngoài Tavily.
- Lưu chain-of-thought ẩn. Thay vào đó lưu application prompt đã redact, tool arguments/results, model output, timestamps, token metadata nếu provider trả về và lỗi.
- Thay đổi giới hạn refresh một giờ, preferences hay UX modal.

## Tiêu chí chấp nhận

- Typecheck/build/lint hiện tại vẫn pass.
- API-key refresh tạo được nhiều tool/model spans và structured opportunities như cũ.
- OAuth refresh dùng đúng cấu hình ChatGPT Responses đã chạy ở Smart Stock, không truyền `max_output_tokens`, và agent vẫn trả structured opportunities.
- Trace phản ánh đúng số model/tool calls thực tế; không có span giả.
- Tavily lỗi, model timeout hoặc output sai schema đều giữ feed cũ và trả lỗi bounded.
- Không credential/token/hidden chain-of-thought xuất hiện trong DB, export hay log.

## Rủi ro và quyết định nâng cấp

Không nên lưu chain-of-thought ẩn vì có thể chứa dữ liệu nhạy cảm, prompt nội bộ hoặc suy luận riêng tư; trace kiểm toán ở trên đủ để tái hiện bước gọi và debug. Smart Stock đã chứng minh OAuth private endpoint hoạt động với `ChatOpenAI.useResponsesApi`; nếu runtime/provider trả lỗi capability thì run fail có kiểm soát và giữ feed cũ, không âm thầm biến thành một flow khác.

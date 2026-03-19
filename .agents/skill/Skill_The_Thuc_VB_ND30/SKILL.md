# Skill: Bộ Thể thức Văn bản Hành chính theo Nghị định 30 (NĐ30/2020/NĐ-CP)

## Overview
Skill này hỗ trợ AI Agent soạn thảo và xuất bản văn bản hành chính (Công văn, Quyết định) đúng chuẩn thể thức do Chính phủ quy định tại Nghị định 30/2020/NĐ-CP.

## 1. Cấu trúc dữ liệu yêu cầu (JSON Schema)

### Công văn (Official Letter)
```json
{
  "loai_van_ban": "cong_van",
  "co_quan_chu_quan": "BỘ TÀI CHÍNH",
  "co_quan_ban_hanh": "CỤC THUẾ TP. HÀ NỘI",
  "don_vi_soan_thao": "CT-HNi",
  "dia_danh": "Hà Nội",
  "trich_yeu": "V/v hướng dẫn kê khai thuế TNCN năm 2026",
  "kinh_gui": ["Các Chi cục Thuế quận, huyện", "Phòng Thuế TNCN"],
  "noi_dung": "...",
  "cap_ky": "KT", 
  "chuc_vu_cap_tren": "CỤC TRƯỞNG",
  "chuc_vu_ky": "PHÓ CỤC TRƯỞNG",
  "nguoi_ky": "Nguyễn Văn An",
  "noi_nhan": ["- Như trên;", "- Cục trưởng (để b/c);", "- Lưu: VT, TNCN."]
}
```

### Quyết định (Decision)
```json
{
  "loai_van_ban": "quyet_dinh",
  "co_quan_chu_quan": "BỘ TÀI CHÍNH",
  "co_quan_ban_hanh": "CỤC THUẾ TP. HÀ NỘI",
  "don_vi_soan_thao": "QĐ-CT",
  "trich_yeu": "Về việc thành lập Tổ công tác kiểm tra thuế",
  "can_cu": ["Luật Quản lý thuế số 38/2019/QH14", "..."],
  "noi_dung": "...",
  "cap_ky": "TM",
  "chuc_vu_ky": "CỤC TRƯỞNG",
  "nguoi_ky": "Phạm Đình Hưng",
  "noi_nhan": ["- Như Điều 3;", "- Lưu: VT, TCCB."]
}
```

## 2. Quy trình thực hiện
1. **Tiếp nhận yêu cầu**: Phân loại văn bản (Công văn hay Quyết định).
2. **Khai thác dữ liệu**: Nếu thiếu thông tin (người ký, địa danh...), hãy hỏi người dùng.
3. **Drafting Content**: Soạn thảo nội dung chuyên nghiệp, chuẩn phong cách hành chính.
4. **Export Docx**: Sử dụng script `scripts/generate_docx.js` để tạo file .docx.

## 3. Lệnh vận hành
Chạy script nodejs với tham số:
```bash
node scripts/generate_docx.js --input data.json --output filename.docx
```

## 4. Ti chuẩn Thể thức NĐ30 (Cần lưu ý khi soạn thảo)
- **Tên cơ quan và Quốc hiệu**: Header dạng Table 2 cột, không viền, căn giữa. Quốc hiệu (Cột phải) có gạch ngang dài bằng chữ, Tên cơ quan (Cột trái) có gạch ngang dài bằng 1/3-1/2 tên.
- **Nơi nhận**: Căn trái, in nghiêng dòng "Nơi nhận", các thành phần tiếp theo căn lề 1 tab.
- **Chữ ký**: Căn giữa so với Quốc hiệu hoặc góc phải, trình bày đúng Phân quyền (KT, TM, TL, TU).

import { HiChevronLeft, HiChevronRight } from "react-icons/hi";
import { propertiesStyles as s } from "../../assets/dummyStyles";

// Danh sách nút trang, rút gọn bằng "..." khi nhiều trang. VD trang 5/20: [1, "...", 4, 5, 6, "...", 20]
const getPageItems = (current, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  // luôn đủ 7 ô: trang đầu, ô thứ 2, 3 trang quanh trang hiện tại, ô áp chót, trang cuối
  const start = Math.max(Math.min(current - 1, totalPages - 4), 3);
  const end = Math.min(Math.max(current + 1, 5), totalPages - 2);
  const items = [1, start > 3 ? "start-ellipsis" : 2];
  for (let i = start; i <= end; i++) items.push(i);
  items.push(end < totalPages - 2 ? "end-ellipsis" : totalPages - 1);
  items.push(totalPages);
  return items;
};

/**
 * Phân trang dạng "‹ 1 2 3 … 10 ›" kèm dòng thông tin bên dưới.
 * from/to/total: dùng để hiển thị "from–to trên total {unit}".
 */
const Pagination = ({
  page,
  totalPages,
  onPageChange,
  from,
  to,
  total,
  unit = "bất động sản",
}) => (
  <div className={s.pagination}>
    {totalPages > 1 && (
      <nav className={s.paginationNav} aria-label="Phân trang">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className={s.pageButton(false)}
          aria-label="Trang trước"
        >
          <HiChevronLeft size={20} />
        </button>

        {getPageItems(page, totalPages).map((item) =>
          typeof item === "number" ? (
            <button
              key={item}
              onClick={() => onPageChange(item)}
              className={s.pageButton(item === page)}
              aria-current={item === page ? "page" : undefined}
            >
              {item}
            </button>
          ) : (
            <span key={item} className={s.pageEllipsis}>
              …
            </span>
          ),
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className={s.pageButton(false)}
          aria-label="Trang sau"
        >
          <HiChevronRight size={20} />
        </button>
      </nav>
    )}
    {total > 0 && (
      <p className={s.paginationInfo}>
        {from}–{to} trên {total} {unit}
      </p>
    )}
  </div>
);

export default Pagination;

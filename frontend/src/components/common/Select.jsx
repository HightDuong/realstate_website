import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HiCheck, HiChevronDown } from "react-icons/hi";

const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 280;

/**
 * Dropdown thay cho <select> gốc của trình duyệt.
 * onChange nhận object dạng event ({ target: { name, value } }) để dùng chung
 * với các handler kiểu handleInputChange(e) sẵn có.
 *
 * options: [{ value, label }]
 * className: class cho nút bấm (viền, padding, độ rộng...)
 */
const Select = ({
  name,
  value,
  onChange,
  options,
  className = "",
  menuClassName = "",
  placeholder = "Chọn...",
  disabled = false,
  ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuStyle, setMenuStyle] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const selectedIndex = options.findIndex(
    (o) => String(o.value) === String(value),
  );
  const selected = options[selectedIndex];

  // Menu render qua portal nên không bị cắt bởi card có overflow-hidden
  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < MENU_MAX_HEIGHT + MENU_GAP && rect.top > spaceBelow;
    setMenuStyle({
      position: "fixed",
      left: rect.left,
      minWidth: rect.width,
      maxHeight: Math.min(
        MENU_MAX_HEIGHT,
        (openUp ? rect.top : spaceBelow) - MENU_GAP * 2,
      ),
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + MENU_GAP }
        : { top: rect.bottom + MENU_GAP }),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e) => {
      if (
        !triggerRef.current?.contains(e.target) &&
        !menuRef.current?.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    // Trang cuộn (kể cả do trình duyệt tự cuộn để hiện ô vừa bấm) → menu đi theo ô chọn.
    // Chỉ đóng khi ô chọn đã ra khỏi màn hình. (Đóng ngay khi có scroll làm ô nằm sát mép dưới không mở được.)
    const handleScroll = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) {
        setOpen(false);
        return;
      }
      updatePosition();
    };
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  // Cuộn tới mục đang được chọn/được trỏ bằng bàn phím.
  // Chỉ cuộn bên trong menu: scrollIntoView sẽ cuộn cả trang → sự kiện scroll làm menu đóng ngay.
  useEffect(() => {
    const menu = menuRef.current;
    if (!open || activeIndex < 0 || !menu) return;
    const item = menu.querySelector(`[data-index="${activeIndex}"]`);
    if (!item) return;
    if (item.offsetTop < menu.scrollTop) {
      menu.scrollTop = item.offsetTop;
    } else if (item.offsetTop + item.offsetHeight > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = item.offsetTop + item.offsetHeight - menu.clientHeight;
    }
  }, [open, activeIndex, menuStyle]);

  const openMenu = () => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const choose = (option) => {
    setOpen(false);
    triggerRef.current?.focus();
    if (String(option.value) !== String(value)) {
      onChange?.({ target: { name, value: option.value } });
    }
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (options[activeIndex]) choose(options[activeIndex]);
        break;
      case "Escape":
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  // Chặn click lan lên các phần tử cha (vd. Link của PropertyCard)
  const stop = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        name={name}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          stop(e);
          if (disabled) return;
          open ? setOpen(false) : openMenu();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className={`flex items-center justify-between gap-2 text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
          open ? "border-[#0d9488] ring-2 ring-[#0d9488]/15" : ""
        } ${className}`}
      >
        <span className={`truncate ${selected ? "" : "text-[#94a3b8]"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <HiChevronDown
          size={18}
          className={`shrink-0 text-[#94a3b8] transition-transform duration-200 ${
            open ? "rotate-180 text-[#0d9488]" : ""
          }`}
        />
      </button>

      {open &&
        menuStyle &&
        createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            style={menuStyle}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className={`z-[1000] overflow-y-auto p-1.5 bg-white rounded-xl border border-[#e2e8f0] shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)] animate-[selectIn_120ms_ease-out] ${menuClassName}`}
          >
            {options.map((option, index) => {
              const isSelected = index === selectedIndex;
              const isActive = index === activeIndex;
              return (
                <li
                  key={option.value}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-[0.9rem] cursor-pointer whitespace-nowrap transition-colors ${
                    isSelected
                      ? "text-[#0f766e] font-semibold"
                      : "text-[#334155]"
                  } ${isActive ? "bg-[#f0fdfa]" : ""}`}
                >
                  {option.label}
                  {isSelected && (
                    <HiCheck size={16} className="shrink-0 text-[#0d9488]" />
                  )}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
};

export default Select;

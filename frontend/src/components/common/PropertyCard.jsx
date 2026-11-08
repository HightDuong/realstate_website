import React from "react";
import { propertyCardStyles as s } from "../../assets/dummyStyles";
import { useAuth } from "../../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import {
  HiEye,
  HiHeart,
  HiOutlineHeart,
  HiLocationMarker,
  HiOutlineHome,
  HiOutlineUserGroup,
  HiArrowsExpand,
  HiShieldCheck,
} from "react-icons/hi";
import {
  formatVND,
  getModerationStatus,
  getPropertyTypeLabel,
  joinAddress,
} from "../../utils/propertyLabels";

const PropertyCard = ({
  property,
  renderActions,
  isWishlisted,
  onToggleWishlist,
  showModeration = false, // trang seller/admin: hiện nhãn "Chờ duyệt" / "Bị từ chối"
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!property) return null;

  const formattedPrice = formatVND(property.price);

  const handleWishlistClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      navigate("/login");
      return;
    }
    onToggleWishlist?.(property._id);
  };

  return (
    <div className={s.card}>
      <Link to={`/property/${property._id}`} className={s.link}>
        {/* IMAGE SECTION */}
        <div className={s.imageSection}>
          <img
            src={property.images?.[0] || "/placeholder.jpg"}
            alt={property.title}
            className={s.image}
          />

          {/* Badges */}
          <div className={s.topBadges}>
            <div className={s.badgesLeft}>
              <span className={s.badgeNew}>
                {property.status === "sold" ? "ĐÃ BÁN" : "CÓ SẴN"}
              </span>
              {showModeration && getModerationStatus(property) === "pending" && (
                <span className="px-2.5 py-1 rounded-full text-[0.7rem] font-bold uppercase bg-[#fef3c7] text-[#b45309]">
                  Chờ duyệt
                </span>
              )}
              {showModeration && getModerationStatus(property) === "rejected" && (
                <span className="px-2.5 py-1 rounded-full text-[0.7rem] font-bold uppercase bg-[#fee2e2] text-[#b91c1c]">
                  Bị từ chối
                </span>
              )}
              {property.isVerified && (
                <span className={s.badgeVerified}>
                  <HiShieldCheck size={14} /> Đã kiểm duyệt
                </span>
              )}
            </div>

            {(!user || user.role === "buyer") && (
              <button
                className={s.wishlistButton(isWishlisted)}
                onClick={handleWishlistClick}
              >
                {isWishlisted ? (
                  <HiHeart size={22} className="text-red-500" />
                ) : (
                  <HiOutlineHeart size={22} />
                )}
              </button>
            )}
          </div>

          {/* Price */}
          <div className={s.priceOverlay}>
            <h3 className={s.price}>{formattedPrice}</h3>
          </div>
        </div>

        {/* CONTENT */}
        <div className={s.content}>
          <div className="flex justify-between items-center gap-2 mb-2">
            <span className={`${s.propertyType} truncate min-w-0`} title={getPropertyTypeLabel(property.propertyType)}>
              {getPropertyTypeLabel(property.propertyType)}
            </span>
            <div className={s.views}>
              <HiEye size={16} /> {property.views || 0}
            </div>
          </div>

          {/* TITLE - ĐÃ TỐI ƯU CHO TIẾNG VIỆT DÀI */}
          <h4 className="text-[1.1rem] font-bold leading-[1.35] text-text-main line-clamp-2 mb-3 min-h-[2.8rem]">
            {property.title}
          </h4>

          {/* LOCATION */}
          <div className={s.location}>
            <HiLocationMarker className={s.locationIcon} />
            <span className="line-clamp-1 text-[0.875rem]">
              {joinAddress(property.area, property.city)}
            </span>
          </div>

          {/* SPECS */}
          <div className={s.specsGrid}>
            <div className={s.specItem}>
              <div className={s.specIcon}>
                <HiOutlineHome size={24} />
              </div>
              <div className={s.specValue}>{property.bhk || "—"}</div>
              <div className={s.specLabel}>Phòng ngủ</div>
            </div>
            <div className={`${s.specItem} ${s.specDivider}`}>
              <div className={s.specIcon}>
                <HiOutlineUserGroup size={24} />
              </div>
              <div className={s.specValue}>
                {property.bathrooms || "—"}
              </div>
              <div className={s.specLabel}>Phòng tắm</div>
            </div>
            <div className={s.specItem}>
              <div className={s.specIcon}>
                <HiArrowsExpand size={24} />
              </div>
              <div className={s.specValue}>{property.areaSize || "—"}</div>
              <div className={s.specLabel}>m²</div>
            </div>
          </div>

          {/* BUTTON */}
          {!renderActions && (
            <div className={s.viewDetailsButton}>
              <button className={s.viewDetailsBtn}>Xem chi tiết</button>
            </div>
          )}
        </div>
      </Link>

      {renderActions && (
        <div className={s.actionsContainer}>{renderActions(property)}</div>
      )}
    </div>
  );
};

export default PropertyCard;

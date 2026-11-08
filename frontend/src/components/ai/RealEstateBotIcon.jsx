import robotIcon from "../../assets/chatbot-robot.png";

// Icon chatbot RealEstate.
// Nguồn: Flaticon – https://www.flaticon.com/free-icon/robot_18355220
// Giấy phép miễn phí của Flaticon yêu cầu ghi nguồn: xem ROBOT_ICON_CREDIT trong aiChatConfig.js.

const RealEstateBotIcon = ({ size = 24, className = "", title }) => (
  <img
    src={robotIcon}
    width={size}
    height={size}
    alt={title || ""}
    aria-hidden={title ? undefined : true}
    draggable={false}
    className={`object-contain select-none ${className}`}
  />
);

export default RealEstateBotIcon;

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

CREATE TABLE `channels` (
  `ref_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `twitch_user_id` varchar(25) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `twitch_login` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `twitch_display_name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `channel_title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `channel_game` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `channel_live` int DEFAULT '0',
  UNIQUE KEY `ref_id` (`ref_id`),
  UNIQUE KEY `channels_twitch_user_id_idx` (`twitch_user_id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `links` (
  `ref_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `twitch_user_id` varchar(25) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `discord_user_id` varchar(25) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `discord_guild_id` varchar(25) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `discord_channel_id` varchar(25) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `discord_webhook_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `discord_webhook_token` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `discord_webhook_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `discord_template` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT '[display] NOW LIVE! [title] - Playing [game] - <[link]>',
  UNIQUE KEY `ref_id` (`ref_id`),
  UNIQUE KEY `links_twitch_user_id_idx` (`twitch_user_id`) USING BTREE,
  UNIQUE KEY `links_discord_user_id_idx` (`discord_user_id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `notification_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `twitch_user_id` varchar(25) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `discord_message_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `discord_message_id` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tos` datetime DEFAULT CURRENT_TIMESTAMP,
  `notification_type` int DEFAULT '0',
  `status` int DEFAULT '0',
  `status_words` text COLLATE utf8mb4_general_ci,
  UNIQUE KEY `id` (`id`),
  KEY `notification_log_twitch_user_id_idx` (`twitch_user_id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;



/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

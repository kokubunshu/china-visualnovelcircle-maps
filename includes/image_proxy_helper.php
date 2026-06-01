<?php
// includes/image_proxy_helper.php — 共享：将 lain.bgm.tv 图片 URL 包装为服务端代理 URL

/** 将 lain.bgm.tv 图片 URL 包装为服务端代理 URL */
function proxyImageUrl(string $url): string {
    if ($url === '' || strpos($url, 'lain.bgm.tv') === false) return $url;
    // 避免重复包裹：如果已经是 /api/image_proxy.php 开头，直接原样返回
    if (strncmp($url, '/api/image_proxy.php', 20) === 0) return $url;
    return '/api/image_proxy.php?url=' . urlencode($url);
}

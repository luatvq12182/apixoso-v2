<?php
/**
 * Plugin Name: KQXS Live
 * Description: Kết quả xổ số trực tiếp. Dùng shortcode [kqxs_live] để nhúng vào bất kỳ trang/bài viết nào.
 * Version:     1.0.0
 * Author:      KQXS API
 */

defined('ABSPATH') || exit;

// ─── Constants ───────────────────────────────────────────────────────────────

define('KQXS_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('KQXS_PLUGIN_URL', plugin_dir_url(__FILE__));
define('KQXS_VERSION',    '1.0.0');

// ─── REST API Proxy ──────────────────────────────────────────────────────────
// Proxy này chuyển tiếp long-poll từ browser đến API server nội bộ.
// URL proxy: /wp-json/kqxs/v1/live/{region}?since={ts}

add_action('rest_api_init', function () {
    register_rest_route('kqxs/v1', '/live/(?P<region>mn|mt|mb)', [
        'methods'             => 'GET',
        'callback'            => 'kqxs_proxy_live',
        'permission_callback' => '__return_true',
        'args'                => [
            'region' => [
                'required'          => true,
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'since' => [
                'default'           => 0,
                'sanitize_callback' => 'absint',
            ],
        ],
    ]);

    // Proxy kết quả mới nhất (ngoài giờ live)
    register_rest_route('kqxs/v1', '/results/(?P<region>mn|mt|mb)', [
        'methods'             => 'GET',
        'callback'            => 'kqxs_proxy_results',
        'permission_callback' => '__return_true',
        'args'                => [
            'region' => [
                'required'          => true,
                'sanitize_callback' => 'sanitize_text_field',
            ],
        ],
    ]);
});

function kqxs_proxy_results(WP_REST_Request $req) {
    $region  = $req['region'];
    $api_url = rtrim(get_option('kqxs_api_url', 'http://localhost:3083'), '/');

    $response = wp_remote_get("{$api_url}/api/results/by-ky?region={$region}&limit=1", [
        'timeout' => 10,
        'headers' => ['Accept' => 'application/json'],
    ]);

    if (is_wp_error($response)) {
        return new WP_REST_Response(
            ['success' => false, 'error' => $response->get_error_message()],
            502
        );
    }

    $body = wp_remote_retrieve_body($response);
    $data = json_decode($body, true);

    return new WP_REST_Response(
        $data ?? ['success' => false, 'error' => 'Invalid response from API'],
        200
    );
}

function kqxs_proxy_live(WP_REST_Request $req) {
    $region  = $req['region'];
    $since   = (int) $req->get_param('since');
    $api_url = rtrim(get_option('kqxs_api_url', 'http://localhost:3083'), '/');

    $response = wp_remote_get("{$api_url}/api/live/{$region}?since={$since}", [
        'timeout' => 30,   // đủ cho long-poll (server timeout 25s)
        'headers' => ['Accept' => 'application/json'],
    ]);

    if (is_wp_error($response)) {
        return new WP_REST_Response(
            ['ok' => false, 'error' => $response->get_error_message()],
            502
        );
    }

    $body = wp_remote_retrieve_body($response);
    $data = json_decode($body, true);

    return new WP_REST_Response(
        $data ?? ['ok' => false, 'error' => 'Invalid response from API'],
        200
    );
}

// ─── Admin Settings ──────────────────────────────────────────────────────────

add_action('admin_menu', function () {
    add_options_page('KQXS Live', 'KQXS Live', 'manage_options', 'kqxs-live', 'kqxs_settings_page');
});

function kqxs_settings_page() {
    if (!current_user_can('manage_options')) return;

    if (isset($_POST['kqxs_save']) && check_admin_referer('kqxs_settings_save')) {
        update_option('kqxs_api_url', esc_url_raw(trim($_POST['kqxs_api_url'])));
        echo '<div class="notice notice-success is-dismissible"><p>✓ Đã lưu cài đặt.</p></div>';
    }

    $api_url = get_option('kqxs_api_url', 'http://localhost:3083');
    ?>
    <div class="wrap">
        <h1>KQXS Live — Cài đặt</h1>
        <form method="post">
            <?php wp_nonce_field('kqxs_settings_save'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="kqxs_api_url">API URL</label></th>
                    <td>
                        <input type="url" id="kqxs_api_url" name="kqxs_api_url"
                               value="<?= esc_attr($api_url) ?>" class="regular-text"
                               placeholder="http://localhost:3083" />
                        <p class="description">
                            URL của KQXS API server (không có dấu / ở cuối).<br>
                            Ví dụ: <code>http://localhost:3083</code> hoặc <code>https://api.yoursite.com</code>
                        </p>
                    </td>
                </tr>
            </table>
            <p>
                <strong>Proxy endpoint:</strong>
                <code><?= esc_html(rest_url('kqxs/v1/live/{mn|mt|mb}')) ?></code>
            </p>
            <?php submit_button('Lưu cài đặt', 'primary', 'kqxs_save'); ?>
        </form>

        <hr>
        <h2>Hướng dẫn sử dụng Shortcode</h2>
        <table class="widefat striped" style="max-width:700px">
            <thead><tr><th>Shortcode</th><th>Mô tả</th></tr></thead>
            <tbody>
                <tr><td><code>[kqxs_live]</code></td><td>Tự động chọn miền theo giờ hiện tại, có tab chuyển miền</td></tr>
                <tr><td><code>[kqxs_live region="mn"]</code></td><td>Mặc định chọn Miền Nam khi load</td></tr>
                <tr><td><code>[kqxs_live region="mb" tabs="false"]</code></td><td>Chỉ hiển thị Miền Bắc, ẩn tab bar</td></tr>
            </tbody>
        </table>
        <p><strong>CSS classes để style:</strong> xem file <code>kqxs-live.css</code> trong thư mục plugin.</p>
    </div>
    <?php
}

// ─── Shortcode ───────────────────────────────────────────────────────────────
// Dùng: [kqxs_live]
//       [kqxs_live region="mn"]
//       [kqxs_live region="mb" tabs="false"]

add_shortcode('kqxs_live', 'kqxs_live_shortcode');

function kqxs_live_shortcode($atts) {
    $atts = shortcode_atts([
        'region' => '',       // mn | mt | mb | '' = tự động theo giờ
        'tabs'   => 'true',   // 'false' = ẩn tab bar
    ], $atts, 'kqxs_live');

    static $instance = 0;
    $instance++;
    $wrap_id = 'kqxs-live-' . $instance;

    wp_enqueue_script(
        'kqxs-live',
        KQXS_PLUGIN_URL . 'kqxs-live.js',
        [],
        KQXS_VERSION,
        true   // footer
    );
    wp_enqueue_style(
        'kqxs-live',
        KQXS_PLUGIN_URL . 'kqxs-live.css',
        [],
        KQXS_VERSION
    );

    // Truyền proxy URL vào JS (chỉ cần localize 1 lần)
    if ($instance === 1) {
        wp_localize_script('kqxs-live', 'KqxsLiveConfig', [
            'proxyBase'   => rest_url('kqxs/v1/live'),
            'resultsBase' => rest_url('kqxs/v1/results'),
        ]);
    }

    $show_tabs   = ($atts['tabs'] !== 'false');
    $init_region = esc_attr($atts['region']);

    ob_start();
    ?>
    <div class="kqxs-live-wrap" id="<?= esc_attr($wrap_id) ?>" data-init-region="<?= $init_region ?>">

        <?php if ($show_tabs): ?>
        <div class="kqxs-tab-bar" role="tablist">
            <button class="kqxs-tab" data-region="mn" role="tab" type="button">
                Miền Nam <span class="kqxs-tab-time">16:15</span>
            </button>
            <button class="kqxs-tab" data-region="mt" role="tab" type="button">
                Miền Trung <span class="kqxs-tab-time">17:15</span>
            </button>
            <button class="kqxs-tab" data-region="mb" role="tab" type="button">
                Miền Bắc <span class="kqxs-tab-time">18:15</span>
            </button>
        </div>
        <?php endif; ?>

        <div class="kqxs-status-bar">
            <span class="kqxs-dot" data-state="off" aria-hidden="true"></span>
            <span class="kqxs-status-label">Chưa kết nối</span>
            <span class="kqxs-last-update"></span>
        </div>

        <div class="kqxs-grid" role="region" aria-live="polite">
            <div class="kqxs-message">Chọn miền để xem kết quả trực tiếp</div>
        </div>

    </div>
    <?php
    return ob_get_clean();
}

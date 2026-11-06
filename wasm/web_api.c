/*
 * web_api.c —— LowYSwampHut C 内核的 WebAssembly 薄封装。
 *
 * 这里**不包含任何地形 / 结构 / 群系判定**：所有计算仍然由
 * LowYSwampHutFinderBase/src 下的 C 内核完成（与 Java 版、原生 CLI 完全同一条代码路径）。
 * 本文件只做三件事：
 *   1. 把 JavaScript 的 30 位分片种子还原成 uint64_t；
 *   2. 管理一个扫描会话（lysh_scan_session_open / band / free）；
 *   3. 把每个带的结果、统计和命中明细以**稳定的扁平接口**暴露给 JS
 *      （JS 侧不用知道 C 结构体的内存布局）。
 *
 * 线程：浏览器版固定单线程（threads = 1）。Emscripten 的 pthread 需要
 * SharedArrayBuffer / 跨源隔离，本地双击打开不可能满足；单线程 + JS 分带
 * 既保证 file:// 可用，也保证界面在每带之间能刷新。
 *
 * 构建见 wasm/build.ps1。
 */

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "eval.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define LYSH_WEB_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define LYSH_WEB_EXPORT
#endif

/* 单个带最多写回多少条命中。低 Y 小屋极其稀疏；一个带（通常 1~8 行区域）
 * 远达不到这个量级，留 4096 只是为了防御异常参数。 */
#define LYSH_WEB_MAX_HITS 4096

/* 与 eval.h 的 LYSH_HUT_GRADE_INTS 绑定；JS 侧通过 lysh_web_ints_per_hit() 读取。 */
#define LYSH_WEB_INTS_PER_HIT LYSH_HUT_GRADE_INTS

/* 统计字段下标（与 JS 的 STAT 常量保持一致）。 */
enum {
    LYSH_WEB_ST_SCANNED = 0,
    LYSH_WEB_ST_EVALUATED = 1,
    LYSH_WEB_ST_ACCEPTED = 2,
    LYSH_WEB_ST_REJECT_Y = 3,
    LYSH_WEB_ST_REJECT_FLOOD = 4,
    LYSH_WEB_ST_REJECT_BIOME = 5,
    LYSH_WEB_ST_HITS_WRITTEN = 6,
    LYSH_WEB_ST_MS = 7,
    LYSH_WEB_ST_P2_MS = 8,
    LYSH_WEB_ST_COUNT = 9
};

/* 明细字段下标（与 eval.h 的 grade_fill_hit 一致）。 */
enum {
    LYSH_WEB_HIT_X = 0,
    LYSH_WEB_HIT_Z = 1,
    LYSH_WEB_HIT_RX = 2,
    LYSH_WEB_HIT_RZ = 3,
    LYSH_WEB_HIT_DIR = 4,
    LYSH_WEB_HIT_AVG_Y = 5,
    LYSH_WEB_HIT_FLOODED = 6,
    LYSH_WEB_HIT_OK = 7,
    LYSH_WEB_HIT_WET = 8,
    LYSH_WEB_HIT_SIZE_X = 9,
    LYSH_WEB_HIT_SIZE_Z = 10,
    LYSH_WEB_HIT_REJECT = 11
};

static lysh_scan_session *g_session = NULL;
static int *g_hits = NULL;
static lysh_hut_grade g_grade;
static double g_total_ms = 0.0;

/* ------------------------------------------------------------------ */
/* 生命周期                                                            */
/* ------------------------------------------------------------------ */

/** 释放当前会话（幂等，可在任何时刻调用）。 */
LYSH_WEB_EXPORT void lysh_web_close(void) {
    if (g_session) {
        lysh_scan_session_free(g_session);
        g_session = NULL;
    }
    if (g_hits) {
        free(g_hits);
        g_hits = NULL;
    }
    memset(&g_grade, 0, sizeof(g_grade));
    g_total_ms = 0.0;
}

/**
 * 开一个种子扫描会话。
 *
 * 种子以两个 int 传入（lo/hi）—— JS 的 53 位安全整数装不下 int64，
 * 而 Emscripten 的 i64 参数又需要 BigInt / WASM_BIGINT。分片最省事：
 *   seed = (uint64_t)(uint32_t)hi << 32 | (uint32_t)lo
 *
 * @param mc1182     1 = 1.18.x 语义
 * @param singleBiome 1 = 单群系（沼泽）
 * @param v262       1 = 26.2~26.3 语义（0 = 1.19.x~26.1）
 * @param largeBiomes 1 = 巨型生物群系
 * @param maxHeight  阶段 1 的最大高度（-54/-50 会由调用方夹到 -50）
 * @param salt       0 = 内核默认女巫小屋 salt
 * @param threads    浏览器版必须传 1
 * @return 1 = 成功，0 = 失败（内存不足 / 参数非法）
 */
LYSH_WEB_EXPORT int lysh_web_start(int seed_lo, int seed_hi,
                                   int mc1182, int singleBiome,
                                   int v262, int largeBiomes,
                                   int maxHeight, int salt, int threads) {
    lysh_web_close();

    g_hits = (int *)malloc(sizeof(int) * LYSH_WEB_INTS_PER_HIT * LYSH_WEB_MAX_HITS);
    if (!g_hits) return 0;

    lysh_phase1_opts opts;
    memset(&opts, 0, sizeof(opts));
    opts.mc_1_18_2 = mc1182 ? 1 : 0;
    opts.single_biome = singleBiome ? 1 : 0;
    /* ⚠️ 反向映射：v262 = 1 表示 26.2 ⇒ pre_26_2 = 0，与 JNI 桥一致。 */
    opts.pre_26_2 = v262 ? 0 : 1;
    opts.large_biomes = largeBiomes ? 1 : 0;

    uint64_t seed = ((uint64_t)(uint32_t)seed_hi << 32) | (uint64_t)(uint32_t)seed_lo;

    g_session = lysh_scan_session_open(seed, &opts, maxHeight, salt, threads > 0 ? threads : 1);
    if (!g_session) {
        free(g_hits);
        g_hits = NULL;
        return 0;
    }

    memset(&g_grade, 0, sizeof(g_grade));
    g_grade.hits = g_hits;
    g_grade.hits_cap = LYSH_WEB_MAX_HITS;
    g_total_ms = 0.0;
    return 1;
}

/**
 * 扫描一个区域带 [rx0,rx1) × [rz0,rz1)，结果写入内部命中缓冲。
 * 返回 1 = 成功，0 = 没有会话 / 参数非法。
 */
LYSH_WEB_EXPORT int lysh_web_band(int rx0, int rx1, int rz0, int rz1, int maxY) {
    if (!g_session || !g_hits) return 0;
    if (rx1 <= rx0 || rz1 <= rz0) return 0;

    g_grade.hits = g_hits;
    g_grade.hits_cap = LYSH_WEB_MAX_HITS;
    g_grade.hits_written = 0;

    lysh_scan_session_band(g_session, rx0, rx1, rz0, rz1, maxY, &g_grade);
    g_total_ms += g_grade.ms;
    return 1;
}

/* ------------------------------------------------------------------ */
/* 结果读取                                                            */
/* ------------------------------------------------------------------ */

/** 本带写出的命中条数（下一带会覆盖，JS 要当场读完）。 */
LYSH_WEB_EXPORT int lysh_web_hits_count(void) {
    return g_grade.hits_written;
}

/** 本带命中缓冲是否溢出（accepted 多于缓冲容量）。正常搜索恒为 0。 */
LYSH_WEB_EXPORT int lysh_web_hits_overflow(void) {
    return g_grade.accepted > g_grade.hits_written ? 1 : 0;
}

/** 读一条命中的某个字段，field 见 LYSH_WEB_HIT_*。越界返回 0。 */
LYSH_WEB_EXPORT int lysh_web_hit_field(int index, int field) {
    if (!g_hits || index < 0 || index >= g_grade.hits_written) return 0;
    if (field < 0 || field >= LYSH_WEB_INTS_PER_HIT) return 0;
    return g_hits[(size_t)index * LYSH_WEB_INTS_PER_HIT + field];
}

/* 本带 / 累计统计。 */
LYSH_WEB_EXPORT double lysh_web_stat(int index) {
    switch (index) {
        case LYSH_WEB_ST_SCANNED:       return (double)g_grade.scanned;
        case LYSH_WEB_ST_EVALUATED:     return (double)g_grade.evaluated;
        case LYSH_WEB_ST_ACCEPTED:      return (double)g_grade.accepted;
        case LYSH_WEB_ST_REJECT_Y:      return (double)g_grade.rejected_y;
        case LYSH_WEB_ST_REJECT_FLOOD:  return (double)g_grade.rejected_flood;
        case LYSH_WEB_ST_REJECT_BIOME:  return (double)g_grade.rejected_biome;
        case LYSH_WEB_ST_HITS_WRITTEN:  return (double)g_grade.hits_written;
        case LYSH_WEB_ST_MS:            return g_grade.ms;
        case LYSH_WEB_ST_P2_MS:         return g_grade.p2_ms;
        default:                        return 0.0;
    }
}

/** 本会话累计的墙钟时间（毫秒，各带相加）。 */
LYSH_WEB_EXPORT double lysh_web_total_ms(void) {
    return g_total_ms;
}

/** 明细里每条候选占的 int 数（= 12）。 */
LYSH_WEB_EXPORT int lysh_web_ints_per_hit(void) {
    return LYSH_WEB_INTS_PER_HIT;
}

/** 内核版本串。 */
LYSH_WEB_EXPORT const char *lysh_web_version(void) {
    return "LowYSwampHutFinderBase 2.0.3 (WASM core; phase1 + phase2)";
}

import { NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = "https://ntlxfdwpldcnsklmddzd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50bHhmZHdwbGRjbnNrbG1kZHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjkyNTEsImV4cCI6MjA5NjUwNTI1MX0.TDwHNCITp08CXHmxyvO2haDgPMNbAXetFDwViATuJkI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const stealthHeaders = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

const extractDate = (text: string) => {
  if (!text || text.includes('소진') || text.includes('미정')) {
    return null;
  }
  const cleanText = text.replace(/\s+/g, ''); 
  
  const regexFull = /(20\d{2})[.\-년/]+(0?[1-9]|1[0-2])[.\-월/]+(0?[1-9]|[12]\d|3[01])[일]*/g;
  const matchesFull = [...cleanText.matchAll(regexFull)];
  if (matchesFull.length > 0) {
    return `${matchesFull[matchesFull.length - 1][1]}-${matchesFull[matchesFull.length - 1][2].padStart(2, '0')}-${matchesFull[matchesFull.length - 1][3].padStart(2, '0')}`;
  }
  
  const regexShortYear = /(?<!20)(\d{2})[.\-년/]+(0?[1-9]|1[0-2])[.\-월/]+(0?[1-9]|[12]\d|3[01])[일]*/g;
  const matchesShortYear = [...cleanText.matchAll(regexShortYear)];
  if (matchesShortYear.length > 0) {
    return `20${matchesShortYear[matchesShortYear.length - 1][1]}-${matchesShortYear[matchesShortYear.length - 1][2].padStart(2, '0')}-${matchesShortYear[matchesShortYear.length - 1][3].padStart(2, '0')}`;
  }
  
  const regexNoYear = /(0?[1-9]|1[0-2])[.\-월/]+(0?[1-9]|[12]\d|3[01])[일]*/g;
  const matchesNoYear = [...cleanText.matchAll(regexNoYear)];
  if (matchesNoYear.length > 0) {
    return `${new Date().getFullYear()}-${matchesNoYear[matchesNoYear.length - 1][1].padStart(2, '0')}-${matchesNoYear[matchesNoYear.length - 1][2].padStart(2, '0')}`;
  }
  
  const regexYYYYMMDD = /(202\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/g;
  const matchesYYYYMMDD = [...cleanText.matchAll(regexYYYYMMDD)];
  if (matchesYYYYMMDD.length > 0) {
    return `${matchesYYYYMMDD[matchesYYYYMMDD.length - 1][1]}-${matchesYYYYMMDD[matchesYYYYMMDD.length - 1][2]}-${matchesYYYYMMDD[matchesYYYYMMDD.length - 1][3]}`;
  }

  return null;
};

const isPast = (dateStr: string | null) => {
  if (!dateStr) {
    return false; 
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(dateStr);
  targetDate.setHours(0, 0, 0, 0);
  return targetDate.getTime() < today.getTime();
};

const findDeepCondition = (obj: any): string => {
  if (!obj || typeof obj !== 'object') {
    return "";
  }
  for (const key of Object.keys(obj)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('condition') || lowerKey.includes('desc')) {
      const val = obj[key];
      if (typeof val === 'string' && val.length >= 4 && val.length <= 60 && !val.includes('http')) {
        return val.replace(/\n/g, ' ').trim();
      }
    }
    if (typeof obj[key] === 'object') {
      const res = findDeepCondition(obj[key]);
      if (res) {
        return res;
      }
    }
  }
  return "";
};

export async function GET() {
  console.log("🤖 [크롤링 & 마감 기준 사이트별 완벽 분리] 크롤러 가동 시작...");
  
  const diagnostics: Record<string, number> = {
    N_현장결제: 0,
    N_온라인: 0,
    N_쿠폰: 0,
    N_app: 0,
    버거킹: 0,
    SKT: 0,
    트립닷컴: 0,
    호텔스닷컴: 0,
    마이리얼트립: 0,
    CU: 0,
    도미노피자: 0,
    파리바게뜨: 0
  };
  const errors: string[] = [];
  const scrapedDeals: any[] = [];  
  const liveTitlesBySubAndMall: Record<string, string[]> = {};
  
  const pastParisTitles: string[] = [];
  
  const addLiveTitle = (sub: string, mall: string, title: string) => {
    const key = `${sub}_${mall}`;
    if (!liveTitlesBySubAndMall[key]) {
      liveTitlesBySubAndMall[key] = [];
    }
    liveTitlesBySubAndMall[key].push(title);
  };

  let existingTitles: string[] = [];
  try {
    const { data: existingDeals } = await supabase.from('deals').select('title');
    if (existingDeals) {
      existingTitles = existingDeals.map(d => d.title);
    } else {
      existingTitles = [];
    }
  } catch(e: any) {
    errors.push(`[DB 읽기 에러] ${e.message}`);
  }

  const genericContent = "💡 상세 내용은 혜택 받으러 가기 링크를 통해 확인하세요.";

  // ====================================================================
  // 1. 네이버페이 [현장결제] & [온라인]
  // ====================================================================
  const naverPayApis = [
    { url: 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=DOMESTIC_INSTORE&secondCategory=&page=1', sub: '네이버페이 현장결제', diagKey: 'N_현장결제' },
    { url: 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=ONLINE&secondCategory=&page=1', sub: '네이버페이 온라인', diagKey: 'N_온라인' }
  ];

  for (const target of naverPayApis) {
    try {
      const { data: naverData } = await axios.get(target.url, { headers: stealthHeaders, validateStatus: () => true });

      if (naverData?.elements) {
        diagnostics[target.diagKey] += naverData.elements.length; 
        
        naverData.elements.forEach((item: any) => {
          const title = `[${target.sub}] [${item.promotionName}] ${item.exposeTitle}`;
          let conditionText = item.exposeCondition || item.benefitCondition || findDeepCondition(item);
          conditionText = String(conditionText).replace(/\n/g, ' ').trim();
          
          const detailContent = conditionText ? `📌 [조건]\n${conditionText}\n\n${genericContent}` : genericContent;
          const link = item.detailUrl || item.link || "https://pay.naver.com";
          
          addLiveTitle(target.sub, item.promotionName, title); 

          if (!existingTitles.includes(title)) {
            let calculatedEndDate = null;
            const rawJson = JSON.stringify(item);

            const explicitDate = item.endDate || item.endDt || item.displayEndDate || item.endYmd;
            if (explicitDate) {
              calculatedEndDate = extractDate(String(explicitDate));
            }

            if (!calculatedEndDate) {
              const dDayMatch = rawJson.match(/"D-(\d+)"/i) || rawJson.match(/"[a-zA-Z]*(?:dday|leftday|dayleft|remain)[a-zA-Z]*"\s*:\s*(\d+)/i);
              if (dDayMatch) {
                const targetDate = new Date();
                targetDate.setDate(targetDate.getDate() + parseInt(dDayMatch[1], 10)); 
                calculatedEndDate = targetDate.toISOString().split('T')[0];
              }
            }

            if (!calculatedEndDate) {
              const dateMatch = rawJson.match(/(202\d)[-./]?(0[1-9]|1[0-2])[-./]?(0[1-9]|[12]\d|3[01])/);
              if (dateMatch) {
                calculatedEndDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
              }
            }

            if (!isPast(calculatedEndDate)) {
              scrapedDeals.push({
                title: title, 
                content: detailContent, 
                url: link, 
                category: "쇼핑", 
                sub_category: target.sub, 
                author: "AutoBot", 
                mall_name: item.promotionName, 
                status: "진행중", 
                end_date: calculatedEndDate, 
              });
            }
          }
        });
      }
    } catch (e: any) { 
      errors.push(`[${target.sub}] ${e.message}`); 
    }
  }

  // ====================================================================
  // 1-2. 네이버페이 [쿠폰]
  // ====================================================================
  try {
    const COUPON_API_URL = 'https://point.pay.naver.com/pd/public-api/coupon/v1/usages/by-category?couponUsageType=ONLINE';
    const USER_FACING_URL = 'https://point.pay.naver.com/coupon/home/online';
    
    const { data: couponData } = await axios.get(COUPON_API_URL, { headers: stealthHeaders, validateStatus: () => true });
    
    if (couponData && typeof couponData === 'object') {
      const extractCoupons = (obj: any): any[] => {
          let found: any[] = [];
          if (!obj || typeof obj !== 'object') {
            return found;
          }

          const brand = obj.merchantName || obj.brandName || obj.usageName || obj.promotionName; 
          if (brand && typeof brand === 'string' && brand.length < 30) {
              const benefit = obj.benefitName || obj.couponName || obj.title || obj.exposeTitle || "할인 쿠폰"; 
              const condition = obj.conditionText || obj.benefitCondition || findDeepCondition(obj); 
              found.push({ 
                brand: brand, 
                benefit: benefit, 
                condition: condition, 
                raw: obj 
              });
          }
          
          for (const key of Object.keys(obj)) { 
            if (typeof obj[key] === 'object') {
              found = found.concat(extractCoupons(obj[key])); 
            }
          }
          return found;
      };

      const extracted = extractCoupons(couponData);
      const uniqueCoupons = Array.from(new Set(extracted.map(e => JSON.stringify(e)))).map((e: any) => JSON.parse(e));

      uniqueCoupons.forEach((c: any) => {
          const title = `[네이버페이 쿠폰] [${c.brand}] ${c.benefit}`;
          let cText = c.condition ? String(c.condition).replace(/\n/g, ' ').trim() : "";
          const detailContent = cText ? `📌 [조건] ${cText}` : genericContent;

          addLiveTitle("네이버페이 쿠폰", c.brand, title);
          diagnostics.N_쿠폰++;

          if (!existingTitles.includes(title)) {
            scrapedDeals.push({
                title: title, 
                content: detailContent, 
                url: USER_FACING_URL, 
                category: "쇼핑", 
                sub_category: "네이버페이 쿠폰", 
                author: "AutoBot", 
                mall_name: c.brand, 
                status: "진행중", 
                end_date: null, 
            });
          }
      });
    }
  } catch (e: any) { 
    errors.push(`[네이버페이 쿠폰] ${e.message}`); 
  }

  // ====================================================================
  // ✨ 1-3. 네이버페이 [블로그 -> app] (수정: RSS 정규식 확장 + 날짜 없는 유용한 포스트도 수집)
  // ====================================================================
  try {
    const RSS_URL = 'https://rss.blog.naver.com/nv_npay.xml';
    // 실제 RSS에서 확인된 날짜 형식들:
    // (9/14~9/30), (9/9~9/13), (8/29~9/20), (9.2 - 12.31), (8.1 - 12.31)
    // (7/24-7/26), (9/9 ~ 9/13), (7/16~7/31)
    const DATE_REGEX = /\(?\s*(\d{1,2})\s*[./\-월]\s*(\d{1,2})\s*[일]?\s*[~\-]\s*(\d{1,2})\s*[./\-월]\s*(\d{1,2})\s*[일]?\s*\)?/;
    // "단 하루" 패턴: "9/18 단 하루!" → 시작일=종료일
    const SINGLE_DAY_REGEX = /(\d{1,2})\s*[./\-월]\s*(\d{1,2})\s*[일]?\s*단\s*하루/;
    
    const { data: rssXml } = await axios.get(RSS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml,application/xml,text/xml,*/*',
      },
      timeout: 15000,
    });
    
    const $rss = cheerio.load(rssXml, { xmlMode: true });
    
    $rss('item').each((_index, element) => {
      const $item = $rss(element);
      const rawTitle = $item.find('title').text().trim();
      const link = $item.find('link').text().trim();
      
      // HTML 태그와 CDATA 정리
      const cleanTitle = rawTitle.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
      
      // (종료) 마크가 있으면 스킵
      if (!cleanTitle || cleanTitle.startsWith('(종료)') || cleanTitle.includes('[종료]')) {
        return;
      }
      
      let endDateStr: string | null = null;
      
      // 1순위: 범위 날짜 매칭 (M/D~M/D)
      const dateMatch = cleanTitle.match(DATE_REGEX);
      if (dateMatch) {
        const endMonth = parseInt(dateMatch[3], 10);
        const endDay = parseInt(dateMatch[4], 10);
        let year = new Date().getFullYear();
        
        // 연말~내년초 보정
        if (new Date().getMonth() + 1 >= 11 && endMonth <= 2) {
          year += 1;
        }
        endDateStr = `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
      }
      
      // 2순위: "단 하루" 패턴 매칭
      if (!endDateStr) {
        const singleMatch = cleanTitle.match(SINGLE_DAY_REGEX);
        if (singleMatch) {
          const month = parseInt(singleMatch[1], 10);
          const day = parseInt(singleMatch[2], 10);
          let year = new Date().getFullYear();
          if (new Date().getMonth() + 1 >= 11 && month <= 2) {
            year += 1;
          }
          endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
      
      // 종료일이 지났으면 스킵
      if (endDateStr && isPast(endDateStr)) {
        return;
      }
      
      // 날짜가 있는 포스트만 수집 (이벤트성 글)
      if (endDateStr && cleanTitle.length > 0) {
        const title = `[네이버페이 app] ${cleanTitle}`;
        
        addLiveTitle("네이버페이 app", "네이버페이", title);
        diagnostics.N_app++;
        
        if (!existingTitles.includes(title)) {
          scrapedDeals.push({
              title: title, 
              content: genericContent, 
              url: link, 
              category: "쇼핑", 
              sub_category: "네이버페이 app", 
              author: "AutoBot", 
              mall_name: "네이버페이", 
              status: "진행중", 
              end_date: endDateStr, 
          });
        }
      }
    });
    console.log(`[네이버페이 app] RSS에서 ${diagnostics.N_app}개 수집`);
  } catch (e: any) { 
    errors.push(`[네이버페이 app RSS 에러] ${e.message}`); 
  }

  // ====================================================================
  // ✨ 2. 버거킹 (수정: 세션 쿠키 + JSON/form 이중 시도 + 응답 구조 로깅)
  // ====================================================================
  try {
    const SESSION_URL = 'https://www.burgerking.co.kr/event/ongoing';
    const BK_API_URL = 'https://www.burgerking.co.kr/burgerking/BKR0608.json';
    
    // 1단계: 세션 쿠키 획득
    const sessionResp = await axios.get(SESSION_URL, {
      headers: {
        'User-Agent': stealthHeaders['User-Agent'],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 15000,
      validateStatus: () => true
    });
    
    const setCookieHeaders = sessionResp.headers['set-cookie'] || [];
    const cookies = setCookieHeaders.map((c: string) => c.split(';')[0]).join('; ');
    console.log(`[버거킹] 세션 쿠키 ${setCookieHeaders.length}개 획득: ${cookies.substring(0, 100)}`);

    // 2단계: JSON Content-Type으로 시도
    const jsonPayload = {
      message: {
        header: {
          result: true,
          error_code: "",
          error_text: "",
          info_text: "",
          message_version: "",
          login_session_id: "",
          trcode: "BKR0608",
          cd_call_chnn: "01"
        },
        body: {
          cdTypeEvent: "00",
          page: "1",
          pageCount: "20",
          tpStatusEvent: "C"
        }
      }
    };

    let bkData: any = null;
    
    // 시도 1: JSON으로 전송
    try {
      const resp1 = await axios.post(BK_API_URL, jsonPayload, {
        headers: { 
          ...stealthHeaders, 
          'Cookie': cookies,
          'Content-Type': 'application/json; charset=UTF-8', 
          'Origin': 'https://www.burgerking.co.kr', 
          'Referer': SESSION_URL,
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 15000,
        validateStatus: () => true
      });
      bkData = resp1.data;
    } catch { /* 시도 2로 넘어감 */ }

    // 시도 2: form-urlencoded로 전송 (JSON 실패 시)
    if (!bkData || (typeof bkData === 'string' && bkData.includes('<!DOCTYPE'))) {
      const formPayload = 'message=%7B%22header%22%3A%7B%22result%22%3Atrue%2C%22error_code%22%3A%22%22%2C%22error_text%22%3A%22%22%2C%22info_text%22%3A%22%22%2C%22message_version%22%3A%22%22%2C%22login_session_id%22%3A%22%22%2C%22trcode%22%3A%22BKR0608%22%2C%22cd_call_chnn%22%3A%2201%22%7D%2C%22body%22%3A%7B%22cdTypeEvent%22%3A%2200%22%2C%22page%22%3A%221%22%2C%22pageCount%22%3A%2220%22%2C%22tpStatusEvent%22%3A%22C%22%7D%7D';
      const resp2 = await axios.post(BK_API_URL, formPayload, {
        headers: { 
          ...stealthHeaders, 
          'Cookie': cookies,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 
          'Origin': 'https://www.burgerking.co.kr', 
          'Referer': SESSION_URL,
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 15000,
        validateStatus: () => true
      });
      bkData = resp2.data;
    }

    // 응답 구조 로깅 (디버깅용)
    if (bkData) {
      const preview = typeof bkData === 'string' ? bkData.substring(0, 300) : JSON.stringify(bkData).substring(0, 300);
      console.log(`[버거킹] API 응답 미리보기: ${preview}`);
    }

    const findBkEvents = (obj: any): any[] => {
        let found: any[] = [];
        if (!obj || typeof obj !== 'object') {
          return found;
        }
        
        if (Array.isArray(obj)) {
            for (const item of obj) {
              found = found.concat(findBkEvents(item));
            }
            return found;
        }

        const actualTitle = obj.subject || obj.event_nm || obj.title || obj.name || obj.nmEvent || obj.nm_event;
        
        if (actualTitle && typeof actualTitle === 'string' && actualTitle.length > 2 && !actualTitle.includes('http')) {
            found.push({ 
              title: actualTitle, 
              raw: obj 
            });
        } else {
            for (const key in obj) {
                if (typeof obj[key] === 'object') {
                    found = found.concat(findBkEvents(obj[key]));
                }
            }
        }
        
        return found;
    };

    const allBkEvents = findBkEvents(bkData);
    const uniqueBk = Array.from(new Set(allBkEvents.map(e => e.title))).map(t => allBkEvents.find(e => e.title === t));
    console.log(`[버거킹] 이벤트 ${allBkEvents.length}개 발견 (중복제거 ${uniqueBk.length}개)`);

    uniqueBk.forEach((ev: any) => {
      let cleanTitle = ev.title.length > 30 ? ev.title.substring(0, 30) + "..." : ev.title;
      const title = `[버거킹] ${cleanTitle}`;
      const extractedDate = extractDate(JSON.stringify(ev.raw));

      addLiveTitle("버거킹", "버거킹", title); 
      diagnostics.버거킹++;

      if (!existingTitles.includes(title) && !isPast(extractedDate)) {
        scrapedDeals.push({
          title: title, 
          content: genericContent, 
          url: SESSION_URL, 
          category: "음식", 
          sub_category: "버거킹", 
          author: "AutoBot", 
          mall_name: "버거킹", 
          status: "진행중", 
          end_date: extractedDate,
        });
      }
    });

    if (allBkEvents.length === 0) {
      console.warn('[버거킹] ⚠️ API에서 이벤트를 찾지 못함. CSR 사이트라 Puppeteer/Playwright가 필요할 수 있습니다.');
    }
  } catch (e: any) { 
    errors.push(`[버거킹 세션에러] ${e.message}`); 
  }

  // ====================================================================
  // 3. 통신사 SKT (⚠️ 기존 URL 404 → T월드 API 시도)
  // ====================================================================
  try {
    // 기존 sktmembership.co.kr 은 2026년 기준 404 반환 (T월드로 통합)
    // T월드 혜택 이벤트 API 시도
    const TELECOM_URLS = [
      'https://www.tworld.co.kr/web/benefit/event',
      'https://www.tworld.co.kr/poc/benefit/membership',
    ];
    
    let sktSuccess = false;
    for (const url of TELECOM_URLS) {
      try {
        const { data: telecomHtml, status } = await axios.get(url, { 
          headers: stealthHeaders, 
          timeout: 10000,
          validateStatus: () => true 
        });
        
        if (status === 200 && typeof telecomHtml === 'string' && !telecomHtml.includes('찾을 수가 없습니다')) {
          const $ = cheerio.load(telecomHtml);
          
          // 다양한 셀렉터 시도
          $('[class*="event"] li, [class*="benefit"] li, [class*="list"] a[href*="event"]').each((_index, element) => {
            const rawTitle = $(element).find('dt, .tit, .title, strong, h3').first().text().trim()
              || $(element).text().replace(/\s+/g, ' ').trim().substring(0, 50);
            const rawDateText = $(element).find('.date, .period').text().trim() || $(element).text(); 
            if (rawTitle && rawTitle.length > 3 && rawTitle.length < 100) {
              const title = `[T멤버십] ${rawTitle.substring(0, 40)}`;
              const extractedDate = extractDate(rawDateText);
              addLiveTitle("통신사혜택", "SKT", title);
              diagnostics.SKT++;

              if (!existingTitles.includes(title) && !isPast(extractedDate)) {
                scrapedDeals.push({ 
                  title: title, 
                  content: genericContent, 
                  url: url, 
                  category: "쇼핑", 
                  sub_category: "통신사혜택", 
                  author: "AutoBot", 
                  mall_name: "SKT", 
                  status: "진행중", 
                  end_date: extractedDate 
                });
              }
            }
          });
          if (diagnostics.SKT > 0) { sktSuccess = true; break; }
        }
      } catch { /* 다음 URL 시도 */ }
    }
    if (!sktSuccess) {
      console.warn('[SKT] ⚠️ T월드 사이트 개편으로 크롤링 불가. URL 업데이트 필요.');
    }
  } catch (e: any) { 
    errors.push(`[SKT] ${e.message}`); 
  }

  // ====================================================================
  // 4. 여행 3사 
  // ====================================================================
  // ✨ 트립닷컴 (수정: __NEXT_DATA__ JSON에서 adsList 파싱)
  try {
    const TRIP_URL = 'https://kr.trip.com/sale/deals/';
    const { data: tripHtml } = await axios.get(TRIP_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $trip = cheerio.load(tripHtml);
    
    // __NEXT_DATA__에서 adsList를 파싱 (SSR 데이터)
    const nextDataScript = $trip('#__NEXT_DATA__').html();
    if (nextDataScript) {
      try {
        const nextData = JSON.parse(nextDataScript);
        const adsList = nextData?.props?.pageProps?.initialState?.adsData?.adsList || [];
        console.log(`[트립닷컴] __NEXT_DATA__에서 ${adsList.length}개 딜 발견`);
        
        adsList.forEach((ad: any) => {
          const rawTitle = ad.title || '';
          const desc = ad.introduction || '';
          const link = ad.pageLink || ad.canonicalUrl || TRIP_URL;
          const endTime = ad.endTime || ''; // "2026-09-12 22:59:59"
          
          if (rawTitle && rawTitle.length > 2) {
            const displayText = desc ? `${rawTitle} - ${desc}` : rawTitle;
            const title = `[트립닷컴] ${displayText.substring(0, 40)}`;
            
            // endTime에서 날짜 추출
            let extractedDate: string | null = null;
            if (endTime) {
              const dateMatch = endTime.match(/(\d{4})-(\d{2})-(\d{2})/);
              if (dateMatch) {
                extractedDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
              }
            }
            
            addLiveTitle("숙박/호텔", "트립닷컴", title);
            diagnostics.트립닷컴++;

            if (!existingTitles.includes(title) && !isPast(extractedDate)) {
              scrapedDeals.push({ 
                title: title, 
                content: genericContent, 
                url: link, 
                category: "여행", 
                sub_category: "숙박/호텔", 
                author: "AutoBot", 
                mall_name: "트립닷컴", 
                status: "진행중", 
                end_date: extractedDate 
              });
            }
          }
        });
      } catch (jsonErr: any) {
        console.error(`[트립닷컴] JSON 파싱 실패: ${jsonErr.message}`);
      }
    } else {
      console.warn('[트립닷컴] __NEXT_DATA__ 스크립트를 찾을 수 없음');
    }
    console.log(`[트립닷컴] 총 ${diagnostics.트립닷컴}개 수집`);
  } catch (e: any) { 
    errors.push(`[트립닷컴] ${e.message}`); 
  }

  try {
    const HOTELS_URL = 'https://kr.hotels.com/hotel-deals/';
    const { data: hotelsHtml, status: hotelsStatus } = await axios.get(HOTELS_URL, { 
      headers: stealthHeaders, 
      timeout: 15000,
      validateStatus: () => true 
    });
    
    if (hotelsStatus !== 200) {
      console.warn(`[호텔스닷컴] ⚠️ HTTP ${hotelsStatus} 응답 (봇 차단 가능성)`);
    }
    
    const $ = cheerio.load(hotelsHtml);
    
    $('h2, h3, .offer-card-title, .title').each((index, element) => {
      const rawTitle = $(element).text().trim();
      const rawText = $(element).closest('a').text();
      const parentLink = $(element).closest('a').attr('href');
      
      if (rawTitle && (rawTitle.includes('할인') || rawTitle.includes('특가'))) {
        const title = `[호텔스닷컴] ${rawTitle}`;
        const extractedDate = extractDate(rawText);
        
        addLiveTitle("숙박/호텔", "호텔스닷컴", title);
        diagnostics.호텔스닷컴++;

        if (!existingTitles.includes(title) && !isPast(extractedDate)) {
          let finalLink = HOTELS_URL;
          if (parentLink) {
            finalLink = parentLink.startsWith('http') ? parentLink : `https://kr.hotels.com${parentLink}`;
          }

          scrapedDeals.push({ 
            title: title, 
            content: genericContent, 
            url: finalLink, 
            category: "여행", 
            sub_category: "숙박/호텔", 
            author: "AutoBot", 
            mall_name: "호텔스닷컴", 
            status: "진행중", 
            end_date: extractedDate 
          });
        }
      }
    });
  } catch (e: any) { 
    errors.push(`[호텔스닷컴] ${e.message}`); 
  }

  try {
    const MRT_URL = 'https://www.myrealtrip.com/promotions';
    const { data: mrtHtml } = await axios.get(MRT_URL, { headers: stealthHeaders, timeout: 15000, validateStatus: () => true });
    const $mrt = cheerio.load(mrtHtml);
    
    // 마이리얼트립은 CSR이지만 __NEXT_DATA__가 있을 수 있음
    const mrtNextData = $mrt('#__NEXT_DATA__').html();
    if (mrtNextData) {
      try {
        const parsed = JSON.parse(mrtNextData);
        // JSON 구조에서 프로모션 데이터를 재귀적으로 탐색
        const findPromos = (obj: any, results: any[] = []): any[] => {
          if (!obj || typeof obj !== 'object') return results;
          if (Array.isArray(obj)) { obj.forEach(item => findPromos(item, results)); return results; }
          if (obj.title && (obj.imageUrl || obj.image || obj.bannerUrl)) {
            results.push(obj);
          } else {
            Object.values(obj).forEach(v => findPromos(v, results));
          }
          return results;
        };
        const promos = findPromos(parsed);
        promos.forEach((p: any) => {
          const rawTitle = p.title || p.name || '';
          if (rawTitle && rawTitle.length > 3) {
            const title = `[마이리얼트립] ${rawTitle.substring(0, 40)}`;
            const link = p.link || p.url || p.href || MRT_URL;
            addLiveTitle("액티비티/렌트", "마이리얼트립", title);
            diagnostics.마이리얼트립++;
            if (!existingTitles.includes(title)) {
              scrapedDeals.push({ title, content: genericContent, url: link.startsWith('http') ? link : `https://www.myrealtrip.com${link}`, category: "여행", sub_category: "액티비티/렌트", author: "AutoBot", mall_name: "마이리얼트립", status: "진행중", end_date: null });
            }
          }
        });
      } catch { /* JSON 파싱 실패 */ }
    }
    
    // 기존 셀렉터도 시도
    if (diagnostics.마이리얼트립 === 0) {
      $mrt('.promotion-item, a[href*="/promotions/"]').each((_index, element) => {
        const rawTitle = $mrt(element).find('.title, h3, p').first().text().trim() || $mrt(element).text().trim();
        let link = $mrt(element).attr('href') || $mrt(element).closest('a').attr('href');
        
        if (rawTitle && rawTitle.length > 5 && rawTitle.length < 100) {
          const title = `[마이리얼트립] ${rawTitle.substring(0, 40)}`;
          addLiveTitle("액티비티/렌트", "마이리얼트립", title);
          diagnostics.마이리얼트립++;

          if (!existingTitles.includes(title)) {
            let finalLink = link;
            if (link && !link.startsWith('http')) { finalLink = `https://www.myrealtrip.com${link}`; }
            scrapedDeals.push({ title, content: genericContent, url: finalLink || MRT_URL, category: "여행", sub_category: "액티비티/렌트", author: "AutoBot", mall_name: "마이리얼트립", status: "진행중", end_date: null });
          }
        }
      });
    }
    
    if (diagnostics.마이리얼트립 === 0) {
      console.warn('[마이리얼트립] ⚠️ CSR 사이트라 데이터 추출 불가. Puppeteer가 필요할 수 있습니다.');
    } else {
      console.log(`[마이리얼트립] ${diagnostics.마이리얼트립}개 수집`);
    }
  } catch (e: any) { 
    errors.push(`[마이리얼트립] ${e.message}`); 
  }

  // ====================================================================
  // 5. CU 편의점 
  // ====================================================================
  try {
    const CU_URL = 'https://cu.bgfretail.com/brand_info/news_list.do?category=event';
    const { data: cuHtml } = await axios.get(CU_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(cuHtml);
    
    $('.event_list li, .relm_list li, .info_event li, table tbody tr').each((index, element) => {
      const rawTitle = $(element).find('.tit, .txt, .subject, a').first().text().trim();
      const rawDateText = $(element).find('.date, .time, td:nth-child(3)').text().trim() || $(element).text(); 
      const rawLink = $(element).find('a').attr('href');
      
      if (rawTitle && rawTitle.length > 2) {
        const title = `[CU] ${rawTitle}`;
        const extractedDate = extractDate(rawDateText);
        
        addLiveTitle("편의점", "CU", title);
        diagnostics.CU++;

        if (!existingTitles.includes(title) && !isPast(extractedDate)) {
          let finalLink = CU_URL;
          if (rawLink) {
            finalLink = rawLink.startsWith('http') ? rawLink : `https://cu.bgfretail.com${rawLink}`;
          }

          scrapedDeals.push({ 
            title: title, 
            content: genericContent, 
            url: finalLink, 
            category: "음식", 
            sub_category: "편의점", 
            author: "AutoBot", 
            mall_name: "CU", 
            status: "진행중", 
            end_date: extractedDate 
          });
        }
      }
    });
    if (diagnostics.CU === 0) {
      console.warn('[CU] ⚠️ 이벤트 목록이 AJAX로 로드됨 (brand_news div 비어있음). 정적 HTML에서 데이터 없음.');
    } else {
      console.log(`[CU] ${diagnostics.CU}개 수집`);
    }
  } catch (e: any) { 
    errors.push(`[CU] ${e.message}`); 
  }

  // ====================================================================
  // 6. 도미노피자 (수정: euc-kr 인코딩 + menu-list > a > img alt 셀렉터)
  // ====================================================================
  try {
    const DOMINO_URL = 'https://web.dominos.co.kr/event/list?gubun=E0200';
    const { data: dominoBuffer } = await axios.get(DOMINO_URL, { 
      headers: stealthHeaders, 
      responseType: 'arraybuffer', // euc-kr 대응
      validateStatus: () => true 
    });
    
    // euc-kr → utf-8 디코딩
    let dominoHtml: string;
    try {
      const iconv = require('iconv-lite');
      dominoHtml = iconv.decode(Buffer.from(dominoBuffer), 'euc-kr');
    } catch {
      // iconv-lite가 없으면 TextDecoder로 시도
      dominoHtml = new TextDecoder('euc-kr').decode(dominoBuffer);
    }
    
    const $ = cheerio.load(dominoHtml);
    
    // 실제 구조: div.menu-list > div.mb-50 > a[href="/event/viewHtml?seq=..."] > img[alt="이벤트제목"]
    $('div.menu-list a[href*="/event/"]').each((_index, element) => {
      const $el = $(element);
      const imgAlt = $el.find('img').attr('alt') || $el.find('img').attr('data-alt') || '';
      const link = $el.attr('href') || '';
      const rawTitle = imgAlt.trim();
      
      if (rawTitle && rawTitle.length > 2) {
        const title = `[도미노피자] ${rawTitle.length > 35 ? rawTitle.substring(0, 35) + '...' : rawTitle}`;
        
        addLiveTitle("도미노피자", "도미노피자", title);
        diagnostics.도미노피자++;

        if (!existingTitles.includes(title)) {
          const finalLink = link.startsWith('http') ? link : `https://web.dominos.co.kr${link.trim()}`;

          scrapedDeals.push({ 
            title: title, 
            content: genericContent, 
            url: finalLink, 
            category: "음식", 
            sub_category: "도미노피자", 
            author: "AutoBot", 
            mall_name: "도미노피자", 
            status: "진행중", 
            end_date: null, 
          });
        }
      }
    });
    console.log(`[도미노피자] ${diagnostics.도미노피자}개 수집`);
  } catch (e: any) { 
    errors.push(`[도미노피자] ${e.message}`); 
  }

  // ====================================================================
  // ✨ 7. 파리바게뜨 (수정: 메인 HTML은 빈 껍데기 → admin-ajax.php API 직접 호출)
  // ====================================================================
  try {
    // 💡 핵심 발견: paris.co.kr/promotion/ 의 <ul id="promotionList"> 는 빈 태그이고,
    // 실제 데이터는 jQuery $.get('admin-ajax.php', {action:'pb_get_promotion_list',...}) 로 동적 로드됨.
    const PAST_PARIS_AJAX = 'https://www.paris.co.kr/wp-admin/admin-ajax.php?action=pb_get_promotion_list&term=past&per_page=30&paged=1';
    const { data: pastParisHtml } = await axios.get(PAST_PARIS_AJAX, { 
      headers: { ...stealthHeaders, 'Referer': 'https://www.paris.co.kr/promotion/?cat=past' }, 
      validateStatus: () => true 
    });
    const $past = cheerio.load(pastParisHtml);
    
    // 실제 AJAX 응답 구조: <li> > div.promotion-list-item > h3.post-title > strong.font-pbgothic
    $past('li').each((_index, element) => {
      const $el = $past(element);
      const title = $el.find('h3.post-title strong.font-pbgothic').text().trim()
        || $el.find('h3.post-title a').text().trim();
      
      const combinedText = title;
      const hasKeyword = ['혜택', '증정', '천원', '만원', '00원'].some(k => combinedText.includes(k));

      if (hasKeyword && title.length > 0) {
        const cleanTitle = title.replace(/[^\x00-\x7F\uAC00-\uD7AF\u3130-\u318F\u0020-\u007E\u00A0-\u024F\u2000-\u206F\u2100-\u214F\uFF00-\uFFEF]/g, '').trim();
        pastParisTitles.push(`[파리바게뜨] ${cleanTitle.length > 45 ? cleanTitle.substring(0, 45) + '...' : cleanTitle}`);
      }
    });
    console.log(`[파리바게뜨] 지난 프로모션 ${pastParisTitles.length}개 감지`);
  } catch (e: any) { 
    errors.push(`[파리바게뜨 지난프로모션] ${e.message}`); 
  }

  try {
    // 💡 진행중 프로모션도 동일하게 admin-ajax.php API 호출
    const PARIS_AJAX_URL = 'https://www.paris.co.kr/wp-admin/admin-ajax.php?action=pb_get_promotion_list&term=%EC%A0%84%EC%B2%B4&per_page=30&paged=1';
    const { data: parisHtml } = await axios.get(PARIS_AJAX_URL, { 
      headers: { ...stealthHeaders, 'Referer': 'https://www.paris.co.kr/promotion/' },
      validateStatus: () => true 
    });
    const $ = cheerio.load(parisHtml);
    
    $('li').each((_index, element) => {
      const $el = $(element);
      const title = $el.find('h3.post-title strong.font-pbgothic').text().trim()
        || $el.find('h3.post-title a').text().trim();
      const link = $el.find('h3.post-title a').attr('href') || $el.find('a.img').attr('href') || '';
      const periodText = $el.find('div.period span').text().trim(); // "2026-09-03 ~ 2026-09-30"
      
      // 이모지 제거한 클린 제목
      const cleanTitle = title.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').trim();
      
      const combinedText = cleanTitle;
      const hasKeyword = ['혜택', '증정', '천원', '만원', '00원'].some(k => combinedText.includes(k));

      if (hasKeyword && cleanTitle.length > 0) {
        let finalTitle = cleanTitle;
        if (finalTitle.length > 45) {
          finalTitle = finalTitle.substring(0, 45) + "..."; 
        }

        const fullTitle = `[파리바게뜨] ${finalTitle}`;
        const extractedDate = extractDate(periodText);
        
        addLiveTitle("베이커리", "파리바게뜨", fullTitle);
        diagnostics.파리바게뜨++;

        if (!existingTitles.includes(fullTitle)) {
          const finalLink = link.startsWith('http') ? link : (link ? `https://www.paris.co.kr${link}` : 'https://www.paris.co.kr/promotion/');
          
          scrapedDeals.push({
            title: fullTitle, 
            content: genericContent, 
            url: finalLink, 
            category: "음식", 
            sub_category: "베이커리", 
            author: "AutoBot", 
            mall_name: "파리바게뜨", 
            status: "진행중", 
            end_date: extractedDate, 
          });
        }
      }
    });
    console.log(`[파리바게뜨] 진행중 프로모션 ${diagnostics.파리바게뜨}개 수집`);
  } catch (e: any) { 
    errors.push(`[파리바게뜨] ${e.message}`); 
  }

  // ====================================================================
  // 8. DB 저장 및 마감 판정 로직
  // ====================================================================
  let newCount = 0;
  try {
    if (scrapedDeals.length > 0) {
      await supabase.from('deals').insert(scrapedDeals);
      newCount = scrapedDeals.length;
    }
  } catch(e: any) { 
    errors.push(`DB Insert Error: ${e.message}`); 
  }

  try {
    const { data: allDeals } = await supabase.from('deals').select('id, title, end_date, mall_name, sub_category, status');
    
    if (allDeals) {
      const now = new Date();
      now.setHours(0, 0, 0, 0); 
      const todayStr = now.toISOString().split('T')[0];
      
      const toUpdateAsFinished: number[] = [];
      const toStampEndDateAndFinish: number[] = [];
      const toDeleteIds: number[] = [];

      const liveScanTargets = ["트립닷컴", "호텔스닷컴", "마이리얼트립", "네이버페이 쿠폰"];

      allDeals.forEach((deal: any) => {
        let diffDays = 0;
        let hasDate = !!deal.end_date;

        if (hasDate) {
          const endDate = new Date(deal.end_date);
          endDate.setHours(0, 0, 0, 0);
          if (!isNaN(endDate.getTime())) {
            diffDays = (now.getTime() - endDate.getTime()) / (1000 * 3600 * 24);
          }
        }

        if (hasDate && diffDays > 7) { 
          toDeleteIds.push(deal.id); 
          return; 
        }

        if (deal.status === '종료') {
          return;
        }

        let isZombieOrExpired = false;
        let needsDateStamp = false;

        if (deal.mall_name === '파리바게뜨') {
          if (pastParisTitles.includes(deal.title)) {
            isZombieOrExpired = true;
            if (!hasDate) {
              needsDateStamp = true;
            }
          }
        } 
        else if (!liveScanTargets.includes(deal.mall_name) && !liveScanTargets.includes(deal.sub_category)) {
          if (hasDate && diffDays > 0) {
            isZombieOrExpired = true; 
          }
        } 
        else {
          const key = `${deal.sub_category}_${deal.mall_name}`;
          if (liveTitlesBySubAndMall[key] && liveTitlesBySubAndMall[key].length > 0) {
            if (!liveTitlesBySubAndMall[key].includes(deal.title)) {
              isZombieOrExpired = true; 
              if (!hasDate) {
                needsDateStamp = true; 
              }
            }
          }
        }

        if (isZombieOrExpired) {
          if (needsDateStamp) {
            toStampEndDateAndFinish.push(deal.id);
          } else {
            toUpdateAsFinished.push(deal.id);
          }
        }
      });

      if (toDeleteIds.length > 0) {
        await supabase.from('deals').delete().in('id', toDeleteIds);
      }
      
      if (toUpdateAsFinished.length > 0) {
        await supabase.from('deals').update({ status: '종료' }).in('id', toUpdateAsFinished);
      }
      
      if (toStampEndDateAndFinish.length > 0) {
        await supabase.from('deals').update({ 
          status: '종료', 
          end_date: todayStr 
        }).in('id', toStampEndDateAndFinish);
      }
    }
    
    const allScrapedTitles = Object.values(liveTitlesBySubAndMall).flat();
    if (allScrapedTitles.length > 0) {
        await supabase.from('deals').update({ status: '진행중' }).in('title', allScrapedTitles).eq('status', '종료');
    }

  } catch (e: any) { 
    errors.push(`DB Update/Delete Error: ${e.message}`); 
  }

  console.log(`🎉 [크롤러 완료] 새로운 글 ${newCount}개 추가됨.`);
  
  return NextResponse.json({ 
    success: true, 
    new_count: newCount, 
    scraped_breakdown: diagnostics, 
    errors: errors 
  });
}
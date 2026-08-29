import { NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = "https://ntlxfdwpldcnsklmddzd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50bHhmZHdwbGRjbnNrbG1kZHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjkyNTEsImV4cCI6MjA5NjUwNTI1MX0.TDwHNCITp08CXHmxyvO2haDgPMNbAXetFDwViATuJkI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const stealthHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Cache-Control': 'no-cache'
};

const extractDate = (text: string) => {
  if (!text || text.includes('소진') || text.includes('미정')) return null;
  const cleanText = text.replace(/\s+/g, ''); 

  const regexFull = /(20\d{2})[.\-년/]+(0?[1-9]|1[0-2])[.\-월/]+(0?[1-9]|[12]\d|3[01])[일]*/g;
  const matchesFull = [...cleanText.matchAll(regexFull)];
  if (matchesFull.length > 0) {
    const last = matchesFull[matchesFull.length - 1]; 
    return `${last[1]}-${last[2].padStart(2, '0')}-${last[3].padStart(2, '0')}`;
  }

  const regexShortYear = /(?<!20)(\d{2})[.\-년/]+(0?[1-9]|1[0-2])[.\-월/]+(0?[1-9]|[12]\d|3[01])[일]*/g;
  const matchesShortYear = [...cleanText.matchAll(regexShortYear)];
  if (matchesShortYear.length > 0) {
    const last = matchesShortYear[matchesShortYear.length - 1];
    return `20${last[1]}-${last[2].padStart(2, '0')}-${last[3].padStart(2, '0')}`;
  }

  const regexNoYear = /(0?[1-9]|1[0-2])[.\-월/]+(0?[1-9]|[12]\d|3[01])[일]*/g;
  const matchesNoYear = [...cleanText.matchAll(regexNoYear)];
  if (matchesNoYear.length > 0) {
    const last = matchesNoYear[matchesNoYear.length - 1];
    const currentYear = new Date().getFullYear(); 
    return `${currentYear}-${last[1].padStart(2, '0')}-${last[2].padStart(2, '0')}`;
  }

  return null;
};

export async function GET() {
  console.log("🤖 [제목/조건 분리 + D-day 역산] 크롤러 가동 시작...");
  const scrapedDeals: any[] = [];  
  let totalScrapedCount = 0; 
  
  const liveTitlesBySubAndMall: Record<string, string[]> = {};
  const addLiveTitle = (sub: string, mall: string, title: string) => {
    const key = `${sub}_${mall}`;
    if (!liveTitlesBySubAndMall[key]) liveTitlesBySubAndMall[key] = [];
    liveTitlesBySubAndMall[key].push(title);
  };

  let existingTitles: string[] = [];
  try {
    const { data: existingDeals } = await supabase.from('deals').select('title');
    existingTitles = existingDeals?.map(d => d.title) || [];
  } catch(e) {}

  const genericContent = "💡 상세 내용은 혜택 받으러 가기 링크를 통해 확인하세요.";

  // ====================================================================
  // 1. 네이버페이 [현장결제] & [온라인]
  // ====================================================================
  const naverPayApis = [
    { url: 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=DOMESTIC_INSTORE&secondCategory=&page=1', sub: '네이버페이 현장결제' },
    { url: 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=ONLINE&secondCategory=&page=1', sub: '네이버페이 온라인' }
  ];

  for (const target of naverPayApis) {
    try {
      const { data: naverData } = await axios.get(target.url, { headers: stealthHeaders });

      if (naverData?.elements) {
        totalScrapedCount += naverData.elements.length; 
        
        naverData.elements.forEach((item: any) => {
          // 💡 1. [제목] 깔끔하게 브랜드와 혜택 이름만 조합
          const title = `[${item.promotionName}] ${item.exposeTitle}`;
          
          // 💡 2. [본문] 연회색 세부 조건 텍스트를 찾아서 본문에 예쁘게 삽입!
          let conditionText = item.exposeCondition || item.benefitCondition || item.conditionText || item.benefitDescription || item.desc || "";
          conditionText = String(conditionText).replace(/\n/g, ' ').trim();
          const detailContent = conditionText ? `📌 [조건]\n${conditionText}\n\n${genericContent}` : genericContent;
          
          const link = item.detailUrl || item.link || "https://pay.naver.com";
          
          addLiveTitle(target.sub, item.promotionName, title); 

          if (!existingTitles.includes(title)) {
            let calculatedEndDate = null;
            const rawJson = JSON.stringify(item);

            const explicitDate = item.endDate || item.endDt || item.displayEndDate || item.endYmd;
            if (explicitDate) calculatedEndDate = extractDate(String(explicitDate));

            // 💡 3. [종료 날짜] D-X 를 발견하면 자동 역산 (대표님 아이디어)
            if (!calculatedEndDate) {
              const dDayMatch = rawJson.match(/"D-(\d+)"/i) || rawJson.match(/"[a-zA-Z]*(?:dday|leftday|dayleft|remain)[a-zA-Z]*"\s*:\s*(\d+)/i);
              if (dDayMatch) {
                const daysLeft = parseInt(dDayMatch[1], 10);
                const targetDate = new Date();
                targetDate.setDate(targetDate.getDate() + daysLeft); 
                calculatedEndDate = targetDate.toISOString().split('T')[0];
              }
            }

            if (!calculatedEndDate) {
              const dateMatch = rawJson.match(/(202\d)[-./]?(0[1-9]|1[0-2])[-./]?(0[1-9]|[12]\d|3[01])/);
              if (dateMatch) calculatedEndDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
            }

            scrapedDeals.push({
              title: title, 
              content: detailContent, // ✨ 연회색 조건 텍스트 완벽 삽입!
              url: link, 
              category: "쇼핑", 
              sub_category: target.sub, 
              author: "AutoBot", 
              mall_name: item.promotionName, 
              status: "진행중", 
              end_date: calculatedEndDate, 
            });
          }
        });
      }
    } catch (e: any) { console.error(`🚨 ${target.sub} 에러:`, e.message); }
  }

  // ====================================================================
  // 1-2. 네이버페이 [쿠폰]
  // ====================================================================
  try {
    const COUPON_URL = 'https://point.pay.naver.com/coupon/home/online';
    const { data: couponHtml } = await axios.get(COUPON_URL, { headers: stealthHeaders });
    const $c = cheerio.load(couponHtml);
    const nextDataStr = $c('#__NEXT_DATA__').html();

    if (nextDataStr) {
      const nextData = JSON.parse(nextDataStr);
      
      const findCoupons = (obj: any): any[] => {
          let found: any[] = [];
          if (!obj || typeof obj !== 'object') return found;

          const brand = obj.brandName || obj.merchantName || obj.partnerName || obj.promotionName;
          const benefit = obj.benefitName || obj.couponName || obj.title || obj.exposeTitle || obj.benefit;
          const condition = obj.benefitCondition || obj.exposeCondition || obj.conditionText || obj.description || obj.desc || obj.benefitDescription || "";

          if (brand && benefit && typeof brand === 'string' && typeof benefit === 'string' && brand.length < 30 && benefit.length < 50) {
              if (('couponNo' in obj || 'couponId' in obj || 'validity' in obj || 'downloadUrl' in obj || 'benefit' in obj) && !('isError' in obj)) {
                  found.push({ brand, benefit, condition });
              }
          }
          for (const key in obj) { found = found.concat(findCoupons(obj[key])); }
          return found;
      };

      const extracted = findCoupons(nextData);
      const uniqueCoupons = Array.from(new Set(extracted.map(e => JSON.stringify(e)))).map((e: any) => JSON.parse(e));

      uniqueCoupons.forEach((c: any) => {
          const title = `[${c.brand}] ${c.benefit}`;
          
          let cText = c.condition ? String(c.condition).replace(/\n/g, ' ').trim() : "";
          const detailContent = cText ? `📌 [조건]\n${cText}\n\n${genericContent}` : genericContent;

          addLiveTitle("네이버페이 쿠폰", c.brand, title);

          if (!existingTitles.includes(title)) {
            totalScrapedCount++;
            scrapedDeals.push({
                title: title, 
                content: detailContent, // 쿠폰의 세부 조건도 본문으로 삽입!
                url: COUPON_URL, 
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
  } catch (e: any) { console.error("🚨 네이버페이 쿠폰 에러:", e.message); }

  // ====================================================================
  // 1-3. 네이버페이 [블로그]
  // ====================================================================
  try {
    const BLOG_API = 'https://m.blog.naver.com/api/blogs/nv_npay/post-list?categoryNo=0&itemCount=5&page=1';
    const { data: blogData } = await axios.get(BLOG_API, { headers: stealthHeaders });
    
    if (blogData?.isSuccess && blogData?.result?.items) {
        blogData.result.items.forEach((item: any) => {
            const rawTitle = item.titleNoFormatting;
            if (rawTitle && (rawTitle.includes('이벤트') || rawTitle.includes('혜택') || rawTitle.includes('적립'))) {
                const title = `[네이버페이 공식블로그] ${rawTitle}`;
                const link = `https://m.blog.naver.com/nv_npay/${item.logNo}`;
                
                if (!existingTitles.includes(title)) {
                    totalScrapedCount++;
                    scrapedDeals.push({
                        title: title, 
                        content: genericContent, 
                        url: link, 
                        category: "쇼핑", 
                        sub_category: "네이버페이 블로그", 
                        author: "AutoBot", 
                        mall_name: "네이버페이", 
                        status: "진행중", 
                        end_date: null, 
                    });
                }
            }
        });
    }
  } catch (e: any) { console.error("🚨 네이버페이 블로그 에러:", e.message); }

  // ====================================================================
  // 2. 버거킹
  // ====================================================================
  try {
    const BK_EVENT_URL = 'https://www.burgerking.co.kr/event/ongoing';
    const { data: bkHtml } = await axios.get(BK_EVENT_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(bkHtml);
    $('li, div.event-item, article.list, .item').each((index, element) => {
      const rawText = $(element).text().replace(/\s+/g, ' ').trim();
      const rawTitle = $(element).find('.tit, .txt, strong, h3, h4, p').first().text().trim() || rawText;
      const rawLink = $(element).find('a').attr('href');
      
      if (rawText && rawText.includes('프로모션')) {
        totalScrapedCount++;
        const title = `[버거킹] ${rawTitle.substring(0, 30)}...`;
        addLiveTitle("버거킹", "버거킹", title); 

        if (!existingTitles.includes(title)) {
          let finalLink = rawLink ? (rawLink.startsWith('http') ? rawLink : `https://www.burgerking.co.kr${rawLink.startsWith('/') ? '' : '/'}${rawLink}`) : BK_EVENT_URL;
          scrapedDeals.push({
            title: title, 
            content: genericContent, 
            url: finalLink, 
            category: "음식", 
            sub_category: "버거킹", 
            author: "AutoBot", 
            mall_name: "버거킹", 
            status: "진행중", 
            end_date: extractDate(rawText),
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 3. 통신사 SKT 
  // ====================================================================
  try {
    const TELECOM_URL = 'https://www.sktmembership.co.kr/epass/html/evt/event_list.jsp';
    const { data: telecomHtml } = await axios.get(TELECOM_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(telecomHtml);
    $('.event_list_wrap ul li').each((index, element) => {
      const rawTitle = $(element).find('dt').text().trim();
      const rawDateText = $(element).find('.date').text().trim() || $(element).text(); 
      if (rawTitle) {
        totalScrapedCount++;
        const title = `[T멤버십] ${rawTitle}`;
        addLiveTitle("통신사혜택", "SKT", title);

        if (!existingTitles.includes(title)) {
          scrapedDeals.push({
            title: title, 
            content: genericContent, 
            url: "https://sktmembership.co.kr", 
            category: "쇼핑", 
            sub_category: "통신사혜택", 
            author: "AutoBot", 
            mall_name: "SKT", 
            status: "진행중", 
            end_date: extractDate(rawDateText), 
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 4. 여행 3사 
  // ====================================================================
  try {
    const TRIP_URL = 'https://kr.trip.com/sale/deals/';
    const { data: tripHtml } = await axios.get(TRIP_URL, { headers: stealthHeaders });
    const $ = cheerio.load(tripHtml);
    $('a[href*="/sale/"]').each((index, element) => {
      const rawText = $(element).text().replace(/\s+/g, ' ').trim();
      const link = $(element).attr('href');
      if (rawText && rawText.length > 5) {
        totalScrapedCount++;
        const title = `[트립닷컴] ${rawText.substring(0, 40)}`;
        addLiveTitle("숙박/호텔", "트립닷컴", title);

        if (!existingTitles.includes(title)) {
          scrapedDeals.push({ 
            title: title, 
            content: genericContent, 
            url: link?.startsWith('http') ? link : `https://kr.trip.com${link}`, 
            category: "여행", 
            sub_category: "숙박/호텔", 
            author: "AutoBot", 
            mall_name: "트립닷컴", 
            status: "진행중", 
            end_date: extractDate(rawText)
          });
        }
      }
    });
  } catch (e: any) {}

  try {
    const HOTELS_URL = 'https://kr.hotels.com/hotel-deals/';
    const { data: hotelsHtml } = await axios.get(HOTELS_URL, { headers: stealthHeaders });
    const $ = cheerio.load(hotelsHtml);
    $('h2, h3, .offer-card-title, .title').each((index, element) => {
      const rawTitle = $(element).text().trim();
      const rawText = $(element).closest('a').text();
      const parentLink = $(element).closest('a').attr('href');
      if (rawTitle && (rawTitle.includes('할인') || rawTitle.includes('특가'))) {
        totalScrapedCount++;
        const title = `[호텔스닷컴] ${rawTitle}`;
        addLiveTitle("숙박/호텔", "호텔스닷컴", title);

        if (!existingTitles.includes(title)) {
          scrapedDeals.push({ 
            title: title, 
            content: genericContent, 
            url: parentLink ? (parentLink.startsWith('http') ? parentLink : `https://kr.hotels.com${parentLink}`) : HOTELS_URL, 
            category: "여행", 
            sub_category: "숙박/호텔", 
            author: "AutoBot", 
            mall_name: "호텔스닷컴", 
            status: "진행중", 
            end_date: extractDate(rawText)
          });
        }
      }
    });
  } catch (e: any) {}

  try {
    const MRT_URL = 'https://www.myrealtrip.com/promotions';
    const { data: mrtHtml } = await axios.get(MRT_URL, { headers: stealthHeaders });
    const $ = cheerio.load(mrtHtml);
    $('.promotion-item, a[href*="/promotions/"]').each((index, element) => {
      const rawTitle = $(element).find('.title, h3, p').first().text().trim() || $(element).text().trim();
      const rawDateText = $(element).find('.date, .period').text().trim() || $(element).text();
      const link = $(element).attr('href') || $(element).closest('a').attr('href');
      if (rawTitle && rawTitle.length > 5) {
        totalScrapedCount++;
        const title = `[마이리얼트립] ${rawTitle}`;
        addLiveTitle("액티비티/렌트", "마이리얼트립", title);

        if (!existingTitles.includes(title)) {
          scrapedDeals.push({ 
            title: title, 
            content: genericContent, 
            url: link?.startsWith('http') ? link : `https://www.myrealtrip.com${link}`, 
            category: "여행", 
            sub_category: "액티비티/렌트", 
            author: "AutoBot", 
            mall_name: "마이리얼트립", 
            status: "진행중", 
            end_date: extractDate(rawDateText) 
          });
        }
      }
    });
  } catch (e: any) {}

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
        totalScrapedCount++;
        const title = `[CU] ${rawTitle}`;
        addLiveTitle("편의점", "CU", title);

        if (!existingTitles.includes(title)) {
          scrapedDeals.push({
            title: title, 
            content: genericContent, 
            url: rawLink ? (rawLink.startsWith('http') ? rawLink : `https://cu.bgfretail.com${rawLink}`) : CU_URL, 
            category: "음식", 
            sub_category: "편의점", 
            author: "AutoBot", 
            mall_name: "CU", 
            status: "진행중", 
            end_date: extractDate(rawDateText),
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 6. 맥도날드 
  // ====================================================================
  try {
    const MAC_URL = 'https://www.mcdonalds.co.kr/kor/promotion/list.do';
    const { data: macHtml } = await axios.get(MAC_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(macHtml);
    $('.promList li, .promotion_list li, div.contArea li').each((index, element) => {
      const rawTitle = $(element).find('.tit, strong, h3').first().text().trim() || $(element).text().trim();
      const rawDateText = $(element).find('.date, .term, p.info').text().trim() || $(element).text();
      const rawLink = $(element).find('a').attr('href');
      if (rawTitle && rawTitle.length > 2) {
        totalScrapedCount++;
        const title = `[맥도날드] ${rawTitle}`;
        addLiveTitle("맥도날드", "맥도날드", title);

        if (!existingTitles.includes(title)) {
          scrapedDeals.push({
            title: title, 
            content: genericContent, 
            url: rawLink ? `https://www.mcdonalds.co.kr${rawLink}` : MAC_URL, 
            category: "음식", 
            sub_category: "맥도날드", 
            author: "AutoBot", 
            mall_name: "맥도날드", 
            status: "진행중", 
            end_date: extractDate(rawDateText),
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 7. 써브웨이 
  // ====================================================================
  try {
    const SUB_URL = 'https://www.subway.co.kr/eventList';
    const { data: subHtml } = await axios.get(SUB_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(subHtml);
    $('.event_list li, .event-item, div.pd_list_wrap li').each((index, element) => {
      const rawTitle = $(element).find('.title, strong, h3, h4').first().text().trim();
      const rawDateText = $(element).find('.date, .period, p').text().trim() || $(element).text();
      const rawLink = $(element).find('a').attr('href');
      if (rawTitle && rawTitle.length > 2) {
        totalScrapedCount++;
        const title = `[써브웨이] ${rawTitle}`;
        addLiveTitle("써브웨이", "써브웨이", title);

        if (!existingTitles.includes(title)) {
          scrapedDeals.push({
            title: title, 
            content: genericContent, 
            url: rawLink ? `https://www.subway.co.kr${rawLink}` : SUB_URL, 
            category: "음식", 
            sub_category: "써브웨이", 
            author: "AutoBot", 
            mall_name: "써브웨이", 
            status: "진행중", 
            end_date: extractDate(rawDateText),
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 8. 도미노피자 
  // ====================================================================
  try {
    const DOMINO_URL = 'https://web.dominos.co.kr/event/list?gubun=E0200';
    const { data: dominoHtml } = await axios.get(DOMINO_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(dominoHtml);
    $('.event_list_wrap li, .event-list li, article.event-list li').each((index, element) => {
      const rawTitle = $(element).find('.tit, .subject, strong, p').first().text().trim();
      const rawDateText = $(element).find('.date, .term, p.term').text().trim() || $(element).text();
      const rawLink = $(element).find('a').attr('href');
      if (rawTitle && rawTitle.length > 2) {
        totalScrapedCount++;
        const title = `[도미노피자] ${rawTitle}`;
        addLiveTitle("도미노피자", "도미노피자", title);

        if (!existingTitles.includes(title)) {
          scrapedDeals.push({
            title: title, 
            content: genericContent, 
            url: rawLink ? `https://web.dominos.co.kr${rawLink}` : DOMINO_URL, 
            category: "음식", 
            sub_category: "도미노피자", 
            author: "AutoBot", 
            mall_name: "도미노피자", 
            status: "진행중", 
            end_date: extractDate(rawDateText),
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 9. DB 저장 및 [초정밀] 자동 마감 청소 로직
  // ====================================================================
  let newCount = 0;
  try {
    if (scrapedDeals.length > 0) {
      await supabase.from('deals').insert(scrapedDeals);
      newCount = scrapedDeals.length;
    }
  } catch(e: any) {}

  try {
    const { data: activeDeals } = await supabase.from('deals').select('id, title, end_date, mall_name, sub_category, status').neq('status', '종료');
    
    if (activeDeals) {
      const now = new Date();
      now.setHours(0, 0, 0, 0); 
      
      const toUpdateIds: number[] = [];
      const toDeleteIds: number[] = [];

      activeDeals.forEach((deal: any) => {
        let isZombieOrExpired = false;

        if (deal.end_date) {
          const endDate = new Date(deal.end_date);
          endDate.setHours(0, 0, 0, 0);
          if (!isNaN(endDate.getTime())) {
            const diffDays = (now.getTime() - endDate.getTime()) / (1000 * 3600 * 24);
            if (diffDays > 7) { toDeleteIds.push(deal.id); return; } 
            if (diffDays > 0) isZombieOrExpired = true; 
          }
        }

        const key = `${deal.sub_category}_${deal.mall_name}`;
        if (!isZombieOrExpired && deal.mall_name && liveTitlesBySubAndMall[key] && liveTitlesBySubAndMall[key].length > 0) {
          if (!liveTitlesBySubAndMall[key].includes(deal.title)) {
            isZombieOrExpired = true; 
          }
        }

        if (isZombieOrExpired) {
          toUpdateIds.push(deal.id);
        }
      });

      if (toDeleteIds.length > 0) await supabase.from('deals').delete().in('id', toDeleteIds);
      if (toUpdateIds.length > 0) await supabase.from('deals').update({ status: '종료' }).in('id', toUpdateIds);
      
      console.log(`🧹 [좀비 청소 완료] ${toUpdateIds.length}개의 만료된 이벤트가 종료 탭으로 이동되었습니다.`);
    }
  } catch (e: any) {}

  console.log(`🎉 [크롤러 완료] 새로운 글 ${newCount}개 추가됨.`);
  return NextResponse.json({ success: true, new_count: newCount, total_scraped: totalScrapedCount });
}
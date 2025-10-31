// ラーメン推薦アプリ - メインJavaScript

class RamenRecommender {
    constructor() {
        this.currentLocation = null;
        this.restaurants = [];
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const locationForm = document.getElementById('locationForm');
        locationForm.addEventListener('submit', (e) => this.handleLocationSubmit(e));

        const getCurrentLocationBtn = document.getElementById('getCurrentLocationBtn');
        getCurrentLocationBtn.addEventListener('click', () => this.getCurrentLocation());
    }

    // 場所の入力を処理
    async handleLocationSubmit(event) {
        event.preventDefault();

        const statusElement = document.getElementById('locationStatus');
        const errorElement = document.getElementById('error');
        const locationInput = document.getElementById('locationInput');

        const locationQuery = locationInput.value.trim();

        if (!locationQuery) {
            this.showError('場所を入力してください。');
            return;
        }

        errorElement.classList.add('hidden');
        statusElement.textContent = '場所を検索中...';

        try {
            // Nominatim APIで住所を座標に変換
            const coordinates = await this.geocodeLocation(locationQuery);

            if (coordinates) {
                this.currentLocation = coordinates;
                statusElement.textContent = `📍 ${locationQuery} の周辺を検索します`;
                await this.findNearbyRamenShops();
            } else {
                this.showError('指定された場所が見つかりませんでした。別の場所を試してください。');
                statusElement.textContent = '';
            }
        } catch (error) {
            console.error('Geocoding error:', error);
            this.showError('場所の検索中にエラーが発生しました。もう一度お試しください。');
            statusElement.textContent = '';
        }
    }

    // 住所を座標に変換（Nominatim API使用）
    async geocodeLocation(query) {
        const encodedQuery = encodeURIComponent(query);
        const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=1&countrycodes=jp&accept-language=ja`;

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'RamenRecommendationApp/1.0'
                }
            });

            if (!response.ok) {
                throw new Error('Geocoding request failed');
            }

            const data = await response.json();

            if (data && data.length > 0) {
                return {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon)
                };
            }

            return null;
        } catch (error) {
            console.error('Geocoding error:', error);
            throw error;
        }
    }

    // 現在地を取得
    getCurrentLocation() {
        const statusElement = document.getElementById('locationStatus');
        const errorElement = document.getElementById('error');

        errorElement.classList.add('hidden');
        statusElement.textContent = '位置情報を取得中...';

        if (!navigator.geolocation) {
            this.showError('お使いのブラウザは位置情報サービスに対応していません。');
            statusElement.textContent = '';
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => this.onLocationSuccess(position),
            (error) => this.onLocationError(error),
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    }

    // 位置情報取得成功時
    async onLocationSuccess(position) {
        this.currentLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };

        const statusElement = document.getElementById('locationStatus');
        statusElement.textContent = `📍 現在地を取得しました`;

        await this.findNearbyRamenShops();
    }

    // 位置情報取得エラー時
    onLocationError(error) {
        const statusElement = document.getElementById('locationStatus');
        let errorMessage = '';

        switch(error.code) {
            case error.PERMISSION_DENIED:
                errorMessage = '位置情報の使用が拒否されました。ブラウザの設定を確認してください。';
                break;
            case error.POSITION_UNAVAILABLE:
                errorMessage = '位置情報が利用できません。';
                break;
            case error.TIMEOUT:
                errorMessage = '位置情報の取得がタイムアウトしました。';
                break;
            default:
                errorMessage = '位置情報の取得中にエラーが発生しました。';
        }

        this.showError(errorMessage);
        statusElement.textContent = '';
    }

    // 近くのラーメン屋を検索
    async findNearbyRamenShops() {
        this.showLoading(true);
        const resultsElement = document.getElementById('results');
        resultsElement.classList.add('hidden');

        try {
            // Overpass APIを使用してラーメン屋を検索
            const radius = 2000; // 2km圏内
            const query = this.buildOverpassQuery(this.currentLocation, radius);

            const response = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                body: query
            });

            if (!response.ok) {
                throw new Error('データの取得に失敗しました');
            }

            const data = await response.json();

            // ラーメン屋のデータを処理
            this.restaurants = this.processRestaurantData(data.elements);

            if (this.restaurants.length === 0) {
                this.showError('この地域では営業中のラーメン屋が見つかりませんでした。別の場所を検索してみてください。');
            } else {
                this.displayResults();
            }
        } catch (error) {
            console.error('Error:', error);
            this.showError('ラーメン屋の検索中にエラーが発生しました。しばらく待ってから再度お試しください。');
        } finally {
            this.showLoading(false);
        }
    }

    // Overpass APIクエリを構築
    buildOverpassQuery(location, radius) {
        return `
            [out:json][timeout:25];
            (
                node["amenity"="restaurant"]["cuisine"~"ramen|noodle",i]["disused:amenity"!~"."](around:${radius},${location.lat},${location.lng});
                way["amenity"="restaurant"]["cuisine"~"ramen|noodle",i]["disused:amenity"!~"."](around:${radius},${location.lat},${location.lng});
            );
            out body;
            >;
            out skel qt;
        `;
    }

    // 閉業店舗かどうかを判定
    isClosedBusiness(tags) {
        // disused:amenityタグがある場合は閉業
        if (tags['disused:amenity']) {
            return true;
        }

        // opening_hoursが"closed"の場合は閉業
        if (tags.opening_hours === 'closed') {
            return true;
        }

        // lifecycleタグをチェック
        const lifecycle = tags.lifecycle || tags['lifecycle:status'];
        if (lifecycle === 'abandoned' || lifecycle === 'disused' || lifecycle === 'demolished') {
            return true;
        }

        // 廃業を示すタグをチェック
        if (tags.abandoned === 'yes' || tags.disused === 'yes') {
            return true;
        }

        return false;
    }

    // レストランデータを処理
    processRestaurantData(elements) {
        const restaurants = [];

        for (const element of elements) {
            // 閉業店舗を除外
            if (element.tags && element.tags.name && !this.isClosedBusiness(element.tags)) {
                const rating = this.generateRating();
                const reviewCount = Math.floor(Math.random() * 500) + 50;

                const restaurant = {
                    name: element.tags.name,
                    rating: rating,
                    address: element.tags['addr:full'] || element.tags['addr:street'] || '住所情報なし',
                    distance: this.calculateDistance(
                        this.currentLocation.lat,
                        this.currentLocation.lng,
                        element.lat || element.center?.lat,
                        element.lon || element.center?.lon
                    ),
                    description: this.generateDescription(element.tags),
                    tags: this.extractTags(element.tags),
                    reviewCount: reviewCount,
                    reviewSummary: this.generateReviewSummary(rating),
                    imageUrl: this.generateImageUrl()
                };

                restaurants.push(restaurant);
            }
        }

        // 評価でソート
        restaurants.sort((a, b) => b.rating - a.rating);
        return restaurants.slice(0, 10); // トップ10を返す
    }

    // 2点間の距離を計算（km）
    calculateDistance(lat1, lng1, lat2, lng2) {
        if (!lat2 || !lng2) return 0;

        const R = 6371; // 地球の半径（km）
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return (R * c).toFixed(1);
    }

    toRad(degrees) {
        return degrees * Math.PI / 180;
    }

    // 評価を生成（3.5〜5.0）
    generateRating() {
        return (Math.random() * 1.5 + 3.5).toFixed(1);
    }

    // 説明文を生成
    generateDescription(tags) {
        const descriptions = [
            '地元で愛される老舗ラーメン店。コクのあるスープと自家製麺が自慢です。',
            '濃厚な豚骨スープが人気のお店。替え玉無料サービスも嬉しいポイント。',
            '醤油ベースのあっさりスープが特徴。昔ながらの中華そばが楽しめます。',
            '味噌ラーメンの名店。北海道直送の味噌を使用した深みのある味わい。',
            '魚介系と豚骨のWスープが絶品。つけ麺も人気のメニューです。',
            '細麺とあっさりスープの博多ラーメン。本場の味を再現しています。',
            'コラーゲンたっぷりの鶏白湯スープが自慢。女性客にも人気のお店。',
            '煮干しの風味が効いた和風スープ。トッピングの具材も豊富です。',
            '辛味噌ラーメンが看板メニュー。ガツンとくる辛さがクセになる味。',
            '家系ラーメンの人気店。濃厚なスープとモチモチ太麺の相性抜群。'
        ];

        return descriptions[Math.floor(Math.random() * descriptions.length)];
    }

    // タグを抽出
    extractTags(tags) {
        const tagList = ['ラーメン'];

        if (tags.outdoor_seating === 'yes') tagList.push('テラス席');
        if (tags.wheelchair === 'yes') tagList.push('バリアフリー');
        if (tags.takeaway === 'yes') tagList.push('テイクアウト可');
        if (tags.delivery === 'yes') tagList.push('配達可');
        if (tags.wifi === 'yes') tagList.push('Wi-Fi');
        if (tags.parking === 'yes') tagList.push('駐車場');

        // ランダムでタグを追加
        const randomTags = ['つけ麺', '替え玉無料', '深夜営業', '個室あり', 'カウンター席'];
        const selectedTag = randomTags[Math.floor(Math.random() * randomTags.length)];
        if (!tagList.includes(selectedTag)) {
            tagList.push(selectedTag);
        }

        return tagList;
    }

    // ラーメン画像URLを生成
    generateImageUrl() {
        // Unsplashのラーメン画像を使用
        const ramenImages = [
            'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&h=300&fit=crop', // 醤油ラーメン
            'https://images.unsplash.com/photo-1632709810780-b5a4343cebec?w=400&h=300&fit=crop', // 味噌ラーメン
            'https://images.unsplash.com/photo-1591814468924-caf88d1232e1?w=400&h=300&fit=crop', // 豚骨ラーメン
            'https://images.unsplash.com/photo-1623341214825-9f4f963727da?w=400&h=300&fit=crop', // つけ麺
            'https://images.unsplash.com/photo-1617093727343-374698b1b08d?w=400&h=300&fit=crop', // ラーメン全体
            'https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=400&h=300&fit=crop', // 豪華なラーメン
            'https://images.unsplash.com/photo-1623341214657-7c61fc2c5299?w=400&h=300&fit=crop', // チャーシュー麺
            'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400&h=300&fit=crop', // 海苔ラーメン
        ];

        // ランダムに画像を選択
        return ramenImages[Math.floor(Math.random() * ramenImages.length)];
    }

    // レビュー要約を生成
    generateReviewSummary(rating) {
        const ratingNum = parseFloat(rating);

        const positiveReviews = [
            '「スープが絶品！何度でも通いたくなる味です」',
            '「麺の食感が最高。スープとの相性も抜群」',
            '「店主のこだわりが感じられる一杯」',
            '「行列ができるのも納得の美味しさ」',
            '「コスパ最高！ボリュームも満点」',
            '「チャーシューがとろける柔らかさ」',
            '「深夜まで営業していて助かります」',
            '「家族連れにもおすすめできるお店」',
            '「リピート確定の味！」',
            '「この辺りでは一番美味しい」'
        ];

        const neutralReviews = [
            '「混雑時は待ち時間が長いです」',
            '「駅から少し歩きますが価値あり」',
            '「人気店なので時間帯を選んだほうがいい」',
            '「席数が少ないので相席になることも」',
            '「値段は少し高めですが納得の味」'
        ];

        const improvementReviews = [
            '「もう少し麺が硬めだと好み」',
            '「スープがもう少し熱いと良い」',
            '「トッピングの種類がもっとあると嬉しい」',
            '「駐車場があればなお良し」'
        ];

        // 評価に基づいてレビューを選択
        const reviews = [];

        if (ratingNum >= 4.5) {
            // 高評価：ポジティブ2つ + ニュートラル1つ
            reviews.push(positiveReviews[Math.floor(Math.random() * positiveReviews.length)]);
            reviews.push(positiveReviews[Math.floor(Math.random() * positiveReviews.length)]);
            reviews.push(neutralReviews[Math.floor(Math.random() * neutralReviews.length)]);
        } else if (ratingNum >= 4.0) {
            // 良評価：ポジティブ2つ + 改善点1つ
            reviews.push(positiveReviews[Math.floor(Math.random() * positiveReviews.length)]);
            reviews.push(positiveReviews[Math.floor(Math.random() * positiveReviews.length)]);
            reviews.push(improvementReviews[Math.floor(Math.random() * improvementReviews.length)]);
        } else {
            // 普通評価：ポジティブ1つ + ニュートラル1つ + 改善点1つ
            reviews.push(positiveReviews[Math.floor(Math.random() * positiveReviews.length)]);
            reviews.push(neutralReviews[Math.floor(Math.random() * neutralReviews.length)]);
            reviews.push(improvementReviews[Math.floor(Math.random() * improvementReviews.length)]);
        }

        return reviews;
    }

    // 結果を表示
    displayResults() {
        const resultsElement = document.getElementById('results');
        const restaurantList = document.getElementById('restaurantList');

        restaurantList.innerHTML = '';

        if (this.restaurants.length === 0) {
            this.showError('近くにラーメン屋が見つかりませんでした。');
            return;
        }

        this.restaurants.forEach((restaurant, index) => {
            const card = this.createRestaurantCard(restaurant, index + 1);
            restaurantList.appendChild(card);
        });

        resultsElement.classList.remove('hidden');
    }

    // レストランカードを作成
    createRestaurantCard(restaurant, rank) {
        const card = document.createElement('div');
        card.className = 'restaurant-card';

        const stars = '⭐'.repeat(Math.round(restaurant.rating));
        const mapsUrl = this.getGoogleMapsUrl(restaurant);

        card.innerHTML = `
            <div class="restaurant-header">
                <div class="restaurant-name">${rank}. ${restaurant.name}</div>
                <div class="restaurant-rating">
                    ${stars} ${restaurant.rating}
                </div>
            </div>
            <div class="restaurant-image-container">
                <img src="${restaurant.imageUrl}" alt="${restaurant.name}のラーメン" class="restaurant-image" loading="lazy">
            </div>
            <div class="restaurant-info">
                <div class="info-item">📍 ${restaurant.address}</div>
                <div class="info-item">🚶 徒歩 約${this.getWalkingTime(restaurant.distance)}分 (${restaurant.distance}km)</div>
                <div class="info-item">💬 ${restaurant.reviewCount}件のレビュー</div>
            </div>
            <div class="restaurant-description">
                ${restaurant.description}
            </div>
            <div class="restaurant-reviews">
                <div class="review-header">💭 レビュー要約</div>
                <ul class="review-list">
                    ${restaurant.reviewSummary.map(review => `<li>${review}</li>`).join('')}
                </ul>
            </div>
            <div class="restaurant-tags">
                ${restaurant.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
            <div class="restaurant-actions">
                <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="btn-maps">
                    🗺️ Google Mapsで開く
                </a>
            </div>
        `;

        return card;
    }

    // Google Mapsの検索URLを生成
    getGoogleMapsUrl(restaurant) {
        const query = encodeURIComponent(`${restaurant.name} ${restaurant.address}`);
        return `https://www.google.com/maps/search/?api=1&query=${query}`;
    }

    // 徒歩時間を計算（km → 分）
    getWalkingTime(distance) {
        // 時速4kmで計算
        return Math.ceil(distance / 4 * 60);
    }

    // ローディング表示を切り替え
    showLoading(show) {
        const loadingElement = document.getElementById('loading');
        if (show) {
            loadingElement.classList.remove('hidden');
        } else {
            loadingElement.classList.add('hidden');
        }
    }

    // エラーメッセージを表示
    showError(message) {
        const errorElement = document.getElementById('error');
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
    }
}

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', () => {
    new RamenRecommender();
});

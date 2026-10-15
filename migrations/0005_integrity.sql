CREATE TRIGGER protect_ordered_product BEFORE DELETE ON products WHEN EXISTS(SELECT 1 FROM orders,json_each(orders.items) WHERE json_extract(json_each.value,'$.productId')=OLD.id) BEGIN SELECT RAISE(ABORT,'Product has orders; archive instead'); END;
ALTER TABLE sessions ADD COLUMN pending_totp TEXT;
ALTER TABLE sessions ADD COLUMN pending_totp_expires INTEGER;
UPDATE records SET data=json_set(data,'$.emailSubject','Order received · {orderNumber}','$.emailTemplate','{orderDetails}','$.telegramTemplate','{orderDetails}') WHERE kind='ordering' AND id='main';
